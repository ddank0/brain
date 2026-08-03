---
title: "Licitações - Decisões de Modelagem"
type: note
tags: [tcc, licitacoes, modelagem, postgresql, normalizacao]
created: "2026-08-03"
status: draft
---

Justificativa das escolhas de modelagem do banco do [[TCC - Sistema Inteligente para Licitações]], com as dependências funcionais verificadas no dado real.

> **Proposta, aguardando aprovação.** As correções de 3FN descritas aqui ainda não foram aplicadas ao código: exigem migration nova, ajuste dos modelos SQLAlchemy e mudança nos parsers do [[Licitações - Plano 02 - ETL]]. Nenhum dado foi carregado ainda, então a janela para mudar está aberta.

O esquema em si está em [[Licitações - Modelo de Dados]]. Esta nota responde **por que** ele é assim, e registra o que foi corrigido depois de medir.

---

## Dependências funcionais verificadas

Testadas na competência `202401` completa, não presumidas:

| Determinante | Dependente | Violações | Leitura |
|---|---|---|---|
| `Código Modalidade Compra` | `Modalidade Compra` | **0 / 6** | Funcional perfeita |
| `Código UG` | `Nome UG` | **0 / 772** | Funcional perfeita |
| `Código UG` | `UF` | **0 / 772** | Funcional perfeita |
| `Código UG` | `Município` | **0 / 772** | Funcional perfeita |
| `Código Órgão Superior` | `Nome Órgão Superior` | 2 / 32 | Quase funcional |
| `Código Órgão` | `Nome Órgão` | 6 / 184 | Quase funcional |
| `Código Item Compra` | `Descrição` | 1 / 51.698 | Quase funcional |

As violações residuais são **variação de grafia** na fonte, não dependências genuinamente múltiplas. A carga resolve por `ON CONFLICT DO UPDATE`, em que o último valor prevalece.

## Três violações de 3FN corrigidas

O esquema inicial guardava, em `licitacao`, atributos que não dependem da chave da licitação.

### 1. `modalidade` era atributo de `licitacao`

`codigo_modalidade → modalidade` é funcional perfeita: são seis modalidades para 2.537 licitações. Guardar o nome em cada linha é dependência transitiva, e replica o texto ~423 vezes por modalidade.

**Correção:** tabela `modalidade(codigo, nome)`, com `licitacao.codigo_modalidade` como FK.

**Ganho além da forma normal:** a modalidade é dimensão de análise (RF05 pede distribuição por modalidade). Como tabela, ela ganha PK e passa a ser joinável sem `DISTINCT` sobre milhões de linhas.

### 2. `uf` e `municipio` eram atributos de `licitacao`

`codigo_ug → uf` e `codigo_ug → municipio` são funcionais perfeitas em 772 unidades gestoras. A localização é da unidade gestora, não da licitação.

**Correção:** mover para `unidade_gestora`.

**Ganho:** 342 mil linhas de `licitacao` deixam de carregar dois campos redundantes, e a distribuição geográfica passa a ser consultável direto na dimensão.

### 3. `nome_orgao_superior` era atributo de `orgao`

`nome_orgao_superior` depende de `codigo_orgao_superior`, não da PK `codigo_orgao`. Dependência transitiva clássica.

**Correção:** auto-relacionamento. `orgao.codigo_orgao_superior` vira FK para `orgao.codigo_orgao`, e o nome sai por JOIN.

**Ressalva honesta:** exige que o órgão superior exista como linha em `orgao`. Na competência testada, os 32 códigos superiores aparecem também como órgãos - mas isso precisa de verificação na carga completa, e o job deve inserir os superiores antes dos subordinados. Se algum superior não existir como órgão, a FK precisa ser nullable e a linha é criada com nome do próprio campo.

---

## Desnormalização consciente: quem venceu o item

`item_licitacao.cnpj_vencedor` é derivável de `participante_licitacao` onde `flag_vencedor` é verdadeiro. Em teoria, é redundância e deveria sair.

**O dado real diz o contrário.** Comparando as duas fontes na competência `202401`:

```
itens com vencedor declarado:        51.734
vencedores em participantes:         51.713
casados:                             51.742
mesmo CNPJ:                          51.712
DIVERGENTES:                             30
```

**A fonte já é inconsistente.** Os dois campos vêm de arquivos diferentes do Portal, e discordam em 30 casos.

**Decisão: manter os dois**, com a divergência declarada.

O motivo não é preguiça, é preservação de informação. Escolher uma fonte e descartar a outra:

- Descartar `item.cnpj_vencedor` perderia 21 itens cujo vencedor não aparece em participantes.
- Descartar `participante.flag_vencedor` inviabilizaria os atributos de competitividade, que são a contribuição central do trabalho.
- E a própria divergência é **informação sobre a qualidade do dado**, material legítimo para a monografia.

**Regra de uso, que precisa ser respeitada em `ml/features.py`:** a fonte de verdade para análise de competitividade é `participante_licitacao.flag_vencedor`. O campo `item_licitacao.cnpj_vencedor` serve para consulta e exibição. Misturar os dois numa mesma feature produziria número que ninguém consegue explicar.

---

## Por que participante referencia licitação, e não item

Conceitualmente, um participante concorre a um **item**, então a FK natural seria `item_licitacao_id`. O esquema usa `licitacao_id` mais `codigo_item_compra`.

**Isso parecia falha de modelagem, e o dado provou o contrário:**

```
itens distintos no arquivo de itens:        51.698
códigos de item citados em participantes:   52.145
participantes apontando para item ausente:     448
```

**448 participantes referenciam itens que não existem** no arquivo de itens. Uma FK obrigatória para `item_licitacao` falharia na carga ou descartaria esses registros - e descartar participante é justamente perder o dado mais valioso da fonte.

**Decisão: manter `licitacao_id` + `codigo_item_compra`**, sem FK para `item_licitacao`.

O `codigo_item_compra` fica como atributo de agrupamento, não como chave estrangeira. Consultas que precisam casar participante com item fazem JOIN pelas duas colunas, aceitando que 0,9% não casa.

Isso é modelagem que reflete a realidade da fonte, em vez de impor integridade que o dado não tem.

---

## Chave sintética junto da chave natural

`licitacao` tem `id` serial como PK **e** restrição de unicidade em `(numero_licitacao, codigo_ug, codigo_modalidade)`.

Parece redundante, e é deliberado:

| | Papel |
|---|---|
| `id` (PK) | Referência barata para as tabelas filhas. Um `bigint` em 21,8 milhões de linhas contra três colunas de texto |
| Chave natural (UNIQUE) | Garante idempotência: reprocessar a mesma competência não duplica |

**O número que sustenta a escolha:** `participante_licitacao` tem 21,8 milhões de linhas. Com FK composta de três colunas (`varchar(20)` + `varchar(10)` + `int`), cada linha carregaria ~34 bytes de chave em vez de 8. São ~570 MB só de chave estrangeira, além de índices maiores e JOINs mais lentos.

A alternativa - usar a chave natural como PK - seria mais "pura" e mediria pior.

---

## Particionamento: descartado, com justificativa

`participante_licitacao` terá ~21,8 milhões de linhas, o que naturalmente levanta a questão.

**Descartado por dois motivos.**

**Exigiria desnormalizar.** Para particionar por competência, a coluna `competencia` teria que existir em `participante_licitacao` - hoje ela só está em `licitacao`. Seria introduzir redundância para viabilizar uma otimização.

**Não ajudaria o padrão de acesso real.** Os dois caminhos de consulta são:

1. `licitacao_id` - o JOIN a partir da licitação, em `/licitacoes/{id}` e nas features
2. `cnpj_participante` - a taxa de vitória por fornecedor

Nenhum filtra por competência. Particionamento só acelera quando a consulta filtra pela chave de partição; caso contrário o planejador varre todas as partições e o custo aumenta.

**Volume não justifica isoladamente.** PostgreSQL 16 lida bem com 21,8 milhões de linhas em tabela única, desde que os índices cubram os acessos - e cobrem.

**Quando eu reconsideraria:** se o conector PNCP entrar e o volume subir uma ordem de magnitude, ou se aparecer consulta que filtre por período diretamente em participantes.

---

## Índices durante a carga: medir antes de otimizar

A migration cria os índices antes de qualquer dado entrar. Inserir 21,8 milhões de linhas com índices ativos exige atualizar cada árvore B por linha, e o padrão em carga em massa é o inverso: carregar sem índice, criar depois.

**Decisão: manter os índices e medir.**

O motivo é que a alternativa tem custo próprio. Dropar e recriar índices significa:

- Migration sem os índices, mais comando separado que os cria - o que quebra o `alembic check`, hoje guardando contra divergência entre modelo e migration
- Ou um caminho especial no job `load` que dropa e recria, adicionando estado e possibilidade de deixar o banco sem índice se falhar no meio

O orçamento é de 15 minutos para o `load` completo. Se for respeitado com os índices ativos, a complexidade não se paga. **Plano B documentado**, se furar: `DROP INDEX` antes da carga em massa e `CREATE INDEX` depois, num comando `tcc load --carga-inicial` usado uma única vez.

Isso é coerente com a regra do projeto: não otimizar por intuição, medir e comparar com o orçamento.

---

## Diagrama de entidades

```
                    ┌──────────────────────────┐
                    │ orgao                    │
                    │──────────────────────────│
              ┌────▶│ codigo_orgao         PK  │
              │     │ nome                     │
              └─────│ codigo_orgao_superior FK │  auto-relacionamento
                    └────────────┬─────────────┘
                                 │ 1
                                 │
                                 │ N
                    ┌────────────┴─────────────┐
                    │ unidade_gestora          │
                    │──────────────────────────│
                    │ codigo_ug            PK  │
                    │ nome                     │
                    │ uf                       │  movidos de licitacao
                    │ municipio                │  (codigo_ug -> uf, municipio)
                    │ codigo_orgao         FK  │
                    └────────────┬─────────────┘
                                 │ 1
                                 │
       ┌──────────────────┐      │ N
       │ modalidade       │      │
       │──────────────────│    ┌─┴────────────────────────────────┐
       │ codigo       PK  │◀───│ licitacao                        │
       │ nome             │ N 1│──────────────────────────────────│
       └──────────────────┘    │ id                           PK  │
                               │ numero_licitacao         ┐       │
                               │ codigo_ug                ├ UNIQUE│
                               │ codigo_modalidade    FK  ┘       │
                               │ numero_processo                  │
                               │ objeto                           │
                               │ situacao                         │
                               │ data_abertura   (16% nulos)      │
                               │ data_resultado                   │
                               │ valor       NUMERIC(18,4)        │
                               │ competencia                      │
                               └───┬──────────────────────┬───────┘
                                 1 │                    1 │
                                   │ N                    │ N
              ┌────────────────────┴─────┐   ┌────────────┴──────────────────┐
              │ item_licitacao           │   │ participante_licitacao        │
              │──────────────────────────│   │───────────────────────────────│
              │ id                   PK  │   │ id                        PK  │
              │ licitacao_id         FK  │   │ licitacao_id              FK  │
              │ codigo_item_compra       │   │ codigo_item_compra            │
              │ descricao                │   │   (sem FK: 448 sem item)      │
              │ quantidade               │   │ cnpj_participante         FK  │
              │ valor_item               │   │ flag_vencedor                 │
              │ cnpj_vencedor        FK  │   │   fonte de verdade para       │
              │   desnormalizado:        │   │   competitividade             │
              │   30 divergem de         │   └────────────┬──────────────────┘
              │   participante           │                │ N
              └────────────┬─────────────┘                │
                         N │                              │ N
                           │        ┌─────────────────────┴──┐
                           └───────▶│ fornecedor             │
                                  N │────────────────────────│
                                    │ cnpj               PK  │
                                    │ nome                   │
                                    └────────────────────────┘

  ── Operacional ────────────────────────────────────────────────
  ingestao_log        competencia, arquivo, linhas_*, status, erro

  ── Materializadas pelo ML ─────────────────────────────────────
  serie_mensal        competencia, codigo_orgao, codigo_modalidade,
                      quantidade_licitacoes, valor_total, valor_mediano
  execucao_modelo ──1─┬─N── previsao        serie_chave, competencia_alvo,
                      │                     valor_previsto, ic_*
                      └─N── score_anomalia  licitacao_id, score,
                                            posicao_ranking, features_json
```

## Forma normal alcançada

Depois das correções, o esquema está em **3FN**, com uma desnormalização declarada:

| Tabela | Forma | Observação |
|---|---|---|
| `orgao` | 3FN | Auto-relacionamento eliminou a transitividade |
| `unidade_gestora` | 3FN | Recebeu `uf` e `municipio`, que dependem dela |
| `modalidade` | 3FN | Tabela nova |
| `fornecedor` | 3FN | - |
| `licitacao` | 3FN | Perdeu `modalidade`, `uf`, `municipio`, `nome_ug` |
| `item_licitacao` | **2FN** | `cnpj_vencedor` é derivável - desnormalização consciente |
| `participante_licitacao` | 3FN | - |
| `serie_mensal` | 3FN | Agregado materializado, por definição derivado |

As tabelas de resultado de ML (`serie_mensal`, `previsao`, `score_anomalia`) são **materializações deliberadas**: existem porque a API não executa modelo, e recalcular a cada requisição violaria o RNF06.

## Alternativas de modelagem descartadas

### Star schema puro

Levaria a uma tabela fato única com todas as chaves, e dimensões achatadas. Agrega em ferramenta de BI com consultas ad-hoc.

**Descartado** porque o modelo tem **duas granularidades legítimas** - item e participante - e forçá-las numa fato única exigiria ou duplicar linhas de item por participante, ou criar duas fatos, que é o que já existe. O ganho seria nominal.

### Snowflake completo

Normalizar `situacao` e `objeto` em tabelas próprias.

**Descartado** porque `situacao` é texto livre na fonte, com variação de grafia observada (`"Evento de Alteração Divulgad"`, truncado no próprio dado), e `objeto` é praticamente único por licitação. Normalizar texto livre com variação produz dimensão suja, não economia.

### Chave natural como PK, sem `id`

Mais "puro" conceitualmente.

**Descartado por medida:** ~570 MB adicionais só de chave estrangeira em `participante_licitacao`, com índices maiores e JOINs sobre três colunas de texto em vez de um `bigint`.

### Tabela única desnormalizada

Um "grande achatado" com tudo, como saída dos CSVs.

**Descartado** porque replicaria nome de órgão e de fornecedor em 21,8 milhões de linhas, e impediria a chave natural de garantir idempotência - o requisito central da ingestão.
