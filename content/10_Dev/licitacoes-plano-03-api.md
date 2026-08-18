---
title: "Licitações - Plano 03 - API"
type: note
tags: [tcc, licitacoes, plano, api, php, laravel, openapi]
created: "2026-08-17"
status: ready
---

**Objetivo:** expor os 91 milhões de registros carregados por uma API REST somente leitura, com consulta paginada e filtrada de licitações, quatro análises históricas e contrato OpenAPI versionado.

**Arquitetura:** a API **lê tabelas materializadas e nunca calcula nada caro**. Onde uma análise não couber no orçamento, o cálculo vira job em lote no `tcc-jobs` que grava tabela - ver a medição na Tarefa 1. Regra em [[Licitações - Arquitetura do Sistema]].

**Stack:** PHP 8.4, Laravel 13.23, Eloquent somente leitura, PHPStan nível 10 com Larastan, PHPUnit.

**Cobre:** semana 6. RF04, RF05, RF08, RNF03, RNF06. Fecha o RF10, pendente do Plano 02.

Contexto em [[Licitações - Modelo de Dados]] e [[Licitações - Arquitetura do Sistema]].

---

## Restrições globais

- **Identidade git:** `Gabriel Miranda <isporck0@gmail.com>`.
- **Commits em português**, formato `tipo(escopo): descrição`, corpo explicando o porquê. Commit só quando pedido.
- **Alembic é o único dono do esquema.** As migrations do Laravel ficam desabilitadas; o Eloquent aponta para tabelas existentes. Qualquer tabela nova nasce em `tcc-jobs`.
- **Eloquent somente leitura.** Nenhum `save()`, `create()` ou `delete()` no código da API.
- **Vocabulário:** a API expõe `score` e `posicao_ranking`. **Nunca** `suspeita`, `irregularidade`, `fraude` ou equivalente - nem em nome de campo, nem em label, nem em comentário. Restrição de produto, não de estilo.
- **PHPStan nível 10 limpo** antes de cada commit, junto com `pint`.
- Mudança que atravessa repositórios segue a ordem `tcc-jobs` (esquema) → `tcc-api` (contrato) → `tcc-frontend`.

## Orçamento desta fase

| Operação | Alvo |
|---|---|
| Endpoints de consulta (p95) | < 300 ms |
| Endpoints analíticos (p95) | < 500 ms |
| `aggregate` completo, já com o ranking de fornecedores | < 5 min |

O p95 é **medido, não estimado** - a Tarefa 10 existe para isso.

---

## Verificações feitas antes de escrever este plano

Todas as consultas abaixo rodaram contra a base real de 91.049.511 linhas, não contra amostra.

| Consulta | Tempo | Veredito |
|---|---|---|
| Listagem paginada com filtros de competência, UF e valor | **46 ms** (cache quente) | Cabe no orçamento |
| A mesma, com cache frio | **2.348 ms** | Ver "cache frio", abaixo |
| `COUNT(*)` para a paginação, com os mesmos filtros | **50 ms** | Cabe |
| Itens e participantes de uma licitação, por `licitacao_id` | **9,7 ms** e **8,2 ms** | Cabe |
| Evolução temporal a partir de `serie_mensal` | **19 ms** | Cabe |
| Distribuição por modalidade a partir de `serie_mensal` | **26 ms** | Cabe |
| **Ranking de fornecedores a partir de `item_licitacao`** | **7.866 ms** | **Não cabe - 26x o orçamento** |

### O ranking de fornecedores não pode ser calculado no request

`serie_mensal` agrega por `(competencia, codigo_orgao, codigo_modalidade)`. Não existe nada materializado por fornecedor, então o ranking sairia de um `GROUP BY` sobre os 14,2 milhões de linhas de `item_licitacao`.

Medido: **7,9 segundos**. Além de estourar o orçamento, viola a regra de dependência número 1 do projeto. A solução não é otimizar a consulta - é mover o cálculo para o lote, que é o que a Tarefa 1 faz.

### Cache frio é o risco real do RNF06

A mesma listagem custa 46 ms quente e 2.348 ms fria. O banco tem 12 GB e `licitacao` sozinha tem 608 MB; competências pouco consultadas não estarão em `shared_buffers`.

Isso significa que **medir o p95 com uma única consulta repetida é enganoso** - mede só o caminho quente. A Tarefa 10 sorteia competências ao longo das 136 justamente para não cair nessa armadilha.

### Estado de partida

A API é um esqueleto: só `routes/api.php` com `/health`, um teste (`HealthTest`) e nenhum model. Larastan e Pint já estão instalados e o CI passa.

---

## Tarefa 1: Tabela `ranking_fornecedor` no tcc-jobs

**Repositório:** `tcc-jobs`. É o dono do esquema - a tabela nasce aqui, nunca no Laravel.

**Arquivos:**
- Modificar: `src/tcc_jobs/db/models/analitico.py`
- Criar: migration Alembic
- Modificar: `src/tcc_jobs/etl/agregacao.py` (núcleo puro)
- Modificar: `src/tcc_jobs/db/agregacao_carga.py` (casca)
- Testes: `tests/test_agregacao.py`, `tests/test_agregacao_carga.py`

**Interface produzida:** `serie_fornecedor(lf: pl.LazyFrame) -> pl.LazyFrame`, agregando por `(competencia, cnpj)`.

**Colunas:** `competencia`, `cnpj`, `itens_vencidos`, `valor_total`, `licitacoes_distintas`.

Agregar por competência, e não um ranking global, é o que permite ao endpoint filtrar por período sem recalcular. O ranking global vira `SUM` sobre poucas linhas.

- [ ] **Passo 1: Escrever o teste do núcleo**

Em `tests/test_agregacao.py`, seguindo o que já existe para `serie_mensal`. Use valores assimétricos - dois valores simétricos fazem média e mediana coincidirem e o teste deixa de distinguir uma da outra.

```python
def test_serie_fornecedor_agrega_por_competencia_e_cnpj() -> None:
    resultado = serie_fornecedor(_entrada_itens()).collect()
    linha = resultado.filter(
        (pl.col("competencia") == "202401") & (pl.col("cnpj") == "11111111111111")
    )
    assert linha["itens_vencidos"][0] == 2
    assert linha["valor_total"][0] == Decimal("500.0000")


def test_serie_fornecedor_conta_licitacoes_distintas() -> None:
    """Dois itens da mesma licitação contam como uma licitação vencida."""
    ...


def test_serie_fornecedor_ignora_cnpj_sentinela() -> None:
    """`-11` é "Sigiloso" e `-2` é "Inválido" na fonte - são ausência de dado,
    não fornecedor. Entrar no ranking os transformaria em vencedor fictício."""
    ...
```

- [ ] **Passo 2: Rodar e ver falhar**

- [ ] **Passo 3: Implementar o núcleo**

`LazyFrame` entra, `LazyFrame` sai, sem `collect()` no meio. `valor_total` é `valor_item * quantidade`, com `cast` explícito para `Decimal(18, 4)`.

Filtrar os sentinelas documentados em [[Licitações - Fontes de Dados Públicos]]: `cnpj` em `('-11', '-2')` e os que começam com `ESTRANG`.

- [ ] **Passo 4: Modelo e migration**

Adicionar `RankingFornecedor` em `analitico.py` e incluir em `__all__` - a fixture de teste depende de todo modelo estar registrado no metadata.

Índice em `(competencia)` e em `(cnpj)`. Sem índice, o filtro por período volta a varrer tudo.

```bash
docker compose exec jobs uv run alembic revision --autogenerate -m "ranking de fornecedores"
docker compose exec jobs uv run alembic upgrade head
docker compose exec jobs uv run alembic check
```

- [ ] **Passo 5: Estender a casca do aggregate**

Em `agregacao_carga.py`, mesmo padrão de `serie_mensal`: `TRUNCATE` mais `COPY`. O `TRUNCATE` é o que torna o recálculo idempotente.

- [ ] **Passo 6: Teste da casca**

Em `tests/test_agregacao_carga.py`, incluindo: reagregar não duplica, o total bate com a soma de `item_licitacao`, e nenhum CNPJ do ranking está fora de `fornecedor`.

- [ ] **Passo 7: Rodar contra a base real e medir**

```bash
docker compose exec jobs uv run tcc aggregate
```

Registrar o tempo total. O orçamento do `aggregate` é 5 min e ele levava 10 s; a agregação de 14,2M linhas é o que pode mudar isso.

Depois, medir o endpoint futuro:

```sql
SELECT cnpj, sum(itens_vencidos), sum(valor_total)
FROM ranking_fornecedor GROUP BY cnpj ORDER BY 3 DESC LIMIT 20;
```

**Critério:** abaixo de 500 ms. Eram 7.866 ms lendo `item_licitacao`.

- [ ] **Passo 8: Suíte, contratos e commit**

```bash
uv run ruff check . && uv run ruff format --check . && uv run pyright && uv run lint-imports && uv run pytest -q
```

---

## Tarefa 2: Models Eloquent somente leitura

**Repositório:** `tcc-api`.

**Arquivos:** `app/Models/{Licitacao,ItemLicitacao,ParticipanteLicitacao,Orgao,UnidadeGestora,Modalidade,Fornecedor,SerieMensal,RankingFornecedor,IngestaoLog}.php`.

- [ ] **Passo 1: Desabilitar as migrations do Laravel**

Em `AppServiceProvider::boot()`. Duas ferramentas versionando o mesmo banco produzem conflito garantido, e o Alembic já é o dono.

- [ ] **Passo 2: Teste que trava a propriedade do esquema**

```php
public function test_migrations_do_laravel_estao_desabilitadas(): void
{
    $this->artisan('migrate')->assertFailed();
}

public function test_modelos_apontam_para_as_tabelas_do_alembic(): void
{
    $this->assertSame('licitacao', (new Licitacao)->getTable());
    $this->assertSame('serie_mensal', (new SerieMensal)->getTable());
}
```

- [ ] **Passo 3: Implementar os models**

Cada um com `$table`, `$primaryKey`, `public $timestamps = false` - as tabelas não têm `created_at`. Onde a chave não é `id` (`fornecedor.cnpj`, `orgao.codigo_orgao`), declarar `$keyType = 'string'` e `$incrementing = false`.

Relações: `Licitacao` tem `itens()`, `participantes()`, `modalidade()`, `unidadeGestora()`; `UnidadeGestora` tem `orgao()`.

- [ ] **Passo 4: PHPStan nível 10 e commit**

Larastan em nível 10 exige generics nas relações (`BelongsTo<Modalidade, Licitacao>`). Não silencie com `@phpstan-ignore` - a anotação correta é o que dá valor ao nível 10.

---

## Tarefa 3: `GET /licitacoes` paginado e filtrado

**Cobre o RF04.**

**Arquivos:** `app/Http/Controllers/LicitacaoController.php`, `app/Http/Requests/ListarLicitacoesRequest.php`, `app/Http/Resources/LicitacaoResource.php`, `routes/api.php`, `tests/Feature/LicitacaoIndexTest.php`.

**Filtros:** `codigo_orgao`, `codigo_modalidade`, `uf`, `competencia_de`, `competencia_ate`, `situacao`, `valor_min`, `valor_max`, `q` (busca no objeto). Paginação por `page` e `per_page` (padrão 25, teto 100).

**Decisão de projeto - o filtro de período é por `competencia`, não por `data_abertura`.** Medido no dado real: **72,6% das `data_abertura` são nulas**, variando de 64,8% a 77,4% por ano. Um filtro por data de abertura descartaria silenciosamente três de cada quatro licitações. Ver [[Licitações - Fontes de Dados Públicos]].

- [ ] **Passo 1: Escrever os testes que falham**

Com banco semeado. Cubra: a resposta tem a forma esperada; cada filtro reduz o conjunto; filtros combinam; `per_page` acima do teto é rejeitado; competência malformada devolve 422; página vazia devolve `data: []` e não erro.

```php
public function test_filtra_por_uf(): void
{
    $resposta = $this->getJson('/api/licitacoes?uf=SP');
    $resposta->assertOk()->assertJsonStructure([
        'data' => [['id', 'numero_licitacao', 'objeto', 'valor', 'competencia', 'modalidade', 'unidade_gestora']],
        'meta' => ['total', 'per_page', 'current_page'],
    ]);
    foreach ($resposta->json('data') as $linha) {
        $this->assertSame('SP', $linha['unidade_gestora']['uf']);
    }
}

public function test_teto_de_per_page_e_respeitado(): void
{
    $this->getJson('/api/licitacoes?per_page=5000')->assertStatus(422);
}
```

O teto existe por desempenho: `per_page` sem limite deixa o cliente pedir 1,7 milhão de linhas num request.

- [ ] **Passo 2: Rodar e ver falhar**

- [ ] **Passo 3: Implementar**

Use `select()` explícito com as colunas necessárias e `with()` para as relações - nunca `Licitacao::all()`. Um `get_all()` que instancia centenas de milhares de objetos ORM é ordens de magnitude mais lento que projeção direta.

Não empilhe `row → domínio → DTO → JSON`: vá da consulta ao `Resource`.

- [ ] **Passo 4: Verificar o plano de execução**

```sql
EXPLAIN (ANALYZE, BUFFERS) <consulta gerada pelo Eloquent>;
```

Confirmar que os índices são usados. Se aparecer `Seq Scan` em `licitacao`, o filtro não está sendo empurrado para o banco.

- [ ] **Passo 5: Pint, PHPStan e commit**

---

## Tarefa 4: `GET /licitacoes/{id}` com itens e participantes

**Cobre o RF04.**

- [ ] **Passo 1: Testes**

Cubra: id inexistente devolve 404; a resposta traz itens e participantes; uma licitação sem itens devolve lista vazia e não erro.

O último caso é real, não hipotético: **30.983 licitações (1,78%) não têm nenhum item**, e **34.644 não têm participante** - destas, 15.336 são de `201812`, cujo arquivo a fonte publica truncado.

- [ ] **Passo 2: Implementar**

Carregar itens e participantes com `with()`, nunca em laço - senão é uma consulta por item.

Cuidado com licitações grandes: um `LIMIT` nos filhos, ou pelo menos a contagem exposta, evita resposta de dezenas de MB.

- [ ] **Passo 3: Medir e commitar**

---

## Tarefa 5: `/analytics/evolucao` e `/analytics/modalidades`

**Cobre o RF05.** Ambos leem `serie_mensal`, medidos em 19 ms e 26 ms.

- [ ] **Passo 1: Testes**

Verifique os números contra a fonte, não só a forma: a soma de `quantidade_licitacoes` da resposta tem que bater com `count(*)` de `licitacao` no período semeado.

- [ ] **Passo 2: Implementar**

Consulta direta com o query builder. Sem Eloquent hidratando objetos: é agregação, não domínio.

- [ ] **Passo 3: Sinalizar as competências atípicas**

`202404` traz 721 licitações contra ~2.600 de um mês típico, porque a série termina ali. Sem marcação, um gráfico lê isso como queda real de atividade.

A resposta inclui `parcial: true` nessa competência. É o mesmo caso de `201812`, que tem licitações mas nenhum participante - marcar é o que impede uma conclusão errada.

Este item estava aberto desde o Plano 02 e não tinha dono.

- [ ] **Passo 4: Commit**

---

## Tarefa 6: `/analytics/orgaos` e `/analytics/fornecedores`

**Cobre o RF05.** O de fornecedores depende da Tarefa 1.

- [ ] **Passo 1: Testes**

Inclua o caso de `limit` e o de filtro por período. Verifique que nenhum CNPJ sentinela (`-11`, `-2`, `ESTRANG*`) aparece no ranking.

- [ ] **Passo 2: Implementar lendo as tabelas materializadas**

`/analytics/orgaos` sai de `serie_mensal`; `/analytics/fornecedores`, de `ranking_fornecedor`.

**Nenhum dos dois toca `item_licitacao` ou `participante_licitacao`.** Se algum precisar, a resposta certa é criar tabela materializada, não otimizar a consulta.

- [ ] **Passo 3: Medir contra o orçamento**

Ambos abaixo de 500 ms com a base cheia. Registrar os números.

- [ ] **Passo 4: Commit**

---

## Tarefa 7: `/health` expõe a última ingestão

**Fecha o RF10**, que está parcial desde o Plano 02.

O critério de aceitação é literal: "`GET /health` expõe a última ingestão". A tabela `ingestao_log` já é preenchida e tem 136 linhas; falta o consumidor.

- [ ] **Passo 1: Teste**

```php
public function test_health_expoe_a_ultima_ingestao(): void
{
    $this->getJson('/api/health')->assertOk()->assertJsonStructure([
        'status', 'database',
        'ultima_ingestao' => ['competencia', 'finalizado_em', 'status', 'linhas_lidas', 'linhas_inseridas'],
    ]);
}

public function test_health_sem_ingestao_nao_quebra(): void
{
    IngestaoLog::query()->delete();
    $this->getJson('/api/health')->assertOk()->assertJson(['ultima_ingestao' => null]);
}
```

- [ ] **Passo 2: Implementar e commitar**

Ordenar por `finalizado_em` desc, limite 1. A tabela tem 136 linhas e continuará pequena.

---

## Tarefa 8: OpenAPI e `/docs`

**Cobre o RF08 e o RNF03.**

- [ ] **Passo 1: Escolher a ferramenta**

Avaliar `dedoc/scramble` (gera do código, sem anotações) contra `zircote/swagger-php` (anotações explícitas). Registrar a escolha e o motivo na nota de arquitetura - decisão descartada também é documentação.

- [ ] **Passo 2: Exportar `openapi.json` para a raiz do repositório**

Versionado, não gerado em runtime. O frontend lê `../tcc-api/openapi.json` em desenvolvimento.

- [ ] **Passo 3: `/docs` renderizando a especificação**

- [ ] **Passo 4: Teste que impede o contrato de envelhecer**

```php
public function test_openapi_esta_atualizado(): void
{
    $versionado = json_decode(file_get_contents(base_path('openapi.json')), true);
    $atual = json_decode($this->gerarEspecificacao(), true);
    $this->assertSame($atual, $versionado, 'rode `php artisan openapi:export` e commite');
}
```

Sem isso o `openapi.json` diverge do código em silêncio, e o cliente Angular é gerado de um contrato falso.

- [ ] **Passo 5: Commit**

---

## Tarefa 9: Testes de contrato

**Cobre o RF08.**

- [ ] **Passo 1: Validar as respostas contra o schema do OpenAPI**

Para cada um dos dez endpoints, afirmar que a resposta obedece ao schema declarado. Isso é diferente de checar a forma à mão: pega divergência que um `assertJsonStructure` deixa passar, como tipo trocado.

- [ ] **Passo 2: Teste do vocabulário**

```php
public function test_nenhuma_resposta_usa_vocabulario_de_acusacao(): void
{
    $proibidos = ['suspeita', 'suspeito', 'irregularidade', 'irregular', 'fraude', 'fraudulento', 'ilícito', 'crime'];
    foreach ($this->todosOsEndpoints() as $rota) {
        $corpo = mb_strtolower($this->getJson($rota)->content());
        foreach ($proibidos as $termo) {
            $this->assertStringNotContainsString($termo, $corpo, "endpoint {$rota} usa \"{$termo}\"");
        }
    }
}
```

O sistema aponta atipicidade estatística e **não caracteriza fraude**. Essa é a restrição inviolável do trabalho, e um teste é o que a torna verificável em vez de prometida.

- [ ] **Passo 3: Commit**

---

## Tarefa 10: Medição do p95

**Cobre o RNF06.**

- [ ] **Passo 1: Script de medição**

Em `tcc-infra/scripts/`. Para cada endpoint, 200 requisições com **parâmetros sorteados ao longo das 136 competências**.

O sorteio não é detalhe: repetir a mesma consulta mede só o caminho quente. Medido nesta base, a mesma listagem custa 46 ms quente e **2.348 ms fria** - com 12 GB de banco, boa parte das competências não está em `shared_buffers`.

- [ ] **Passo 2: Rodar e registrar p50, p95 e p99**

- [ ] **Passo 3: Se algum alvo for perdido**

Diagnosticar antes de otimizar, e medir a série completa em vez da média - foi olhando o tempo por competência que o gargalo da carga do Plano 02 apareceu, e ele era invisível no total.

Ordem de investigação: `EXPLAIN (ANALYZE, BUFFERS)`; índice ausente ou não usado; `shared_buffers` do contêiner; e só então mudar o desenho.

Se a causa for cache frio, as saídas são materializar mais ou aquecer o cache no start - **não** relaxar o alvo sem justificativa medida.

- [ ] **Passo 4: Registrar os números na nota de arquitetura**

Números medidos, com data. Substituir "não medido" na tabela de orçamento.

- [ ] **Passo 5: Commit**

---

## Tarefa 11: Índice sem uso

Levantado na revisão do Plano 02: `ix_item_licitacao_codigo_item_compra` ocupa **809 MB** e tem **zero usos** desde a carga. Os índices somam ~4,4 GB dos 12 GB do banco.

- [ ] **Passo 1: Reconferir depois dos endpoints prontos**

```sql
SELECT indexrelname, idx_scan, pg_size_pretty(pg_relation_size(indexrelid))
FROM pg_stat_user_indexes WHERE schemaname = 'public' ORDER BY 3 DESC;
```

- [ ] **Passo 2: Decidir com dado, não por intuição**

Se continuar zerado com todos os endpoints exercitados, remover por migration no `tcc-jobs`, registrando o motivo. Se o `join` de item com participante passar a usá-lo, manter e anotar.

---

## Critério de conclusão

- [ ] Dez endpoints no ar, respondendo sobre a base real de 91 milhões de linhas
- [ ] `openapi.json` versionado, e teste que falha quando ele diverge do código
- [ ] `/docs` renderizando
- [ ] `/health` expondo a última ingestão (fecha o RF10)
- [ ] Consultas com p95 < 300 ms e analíticos < 500 ms, **medidos com competências sorteadas**
- [ ] `ranking_fornecedor` populada pelo `aggregate`, e nenhum endpoint tocando `item_licitacao` ou `participante_licitacao`
- [ ] Competências atípicas (`202404`, `201812`) marcadas nas respostas analíticas
- [ ] Teste de vocabulário passando
- [ ] PHPStan nível 10 limpo, Pint aplicado, CI verde
- [ ] Migrations do Laravel desabilitadas, com teste que trava isso
- [ ] `git status --short` limpo nos repositórios tocados

## Próximo plano

Com a API servindo a série histórica, segue o **Plano 04 - Previsão** (semanas 7-9): SARIMA, backtesting com janela deslizante e o baseline sazonal ingênuo como régua. O teste de vazamento temporal é o mais importante do projeto - um vazamento invalida o trabalho inteiro e é silencioso.
