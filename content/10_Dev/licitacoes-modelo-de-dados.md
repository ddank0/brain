---
title: "Licitações - Modelo de Dados"
type: note
tags: [tcc, licitacoes, postgresql, modelagem, sql]
created: "2026-08-02"
status: ready
---

Esquema do banco do [[TCC - Sistema Inteligente para Licitações]]. Proprietário único: Alembic, do lado dos jobs em Python - ver [[Licitações - Arquitetura do Sistema]].

O **porquê** de cada escolha, com as dependências funcionais medidas no dado real, está em [[Licitações - Decisões de Modelagem]]. O esquema está em 3FN, com uma desnormalização declarada.

## Dimensões

| Tabela | Campos |
|---|---|
| `orgao` | `codigo_orgao` (PK), `nome`, `codigo_orgao_superior` (FK para si mesma, diferida) |
| `unidade_gestora` | `codigo_ug` (PK), `nome`, `uf`, `municipio`, `codigo_orgao` (FK) |
| `modalidade` | `codigo` (PK), `nome` |
| `fornecedor` | `cnpj` (PK), `nome` |

A hierarquia de órgãos é auto-relacionamento, com FK **diferida**: a carga insere em lote sem garantir que o superior venha antes do subordinado, e a verificação acontece no commit.

`uf` e `municipio` pertencem à unidade gestora, não à licitação - `codigo_ug -> uf` e `codigo_ug -> municipio` são dependências funcionais perfeitas no dado real.

## Fatos

**`licitacao`** - `id` (PK sintética), `numero_licitacao`, `codigo_ug` (FK), `codigo_modalidade` (FK), `numero_processo`, `objeto`, `situacao`, `data_abertura`, `data_resultado`, `valor` `NUMERIC(18,4)`, `competencia`

Não guarda nome de modalidade nem localização: ambos eram dependências transitivas.

**`item_licitacao`** - `licitacao_id` (FK), `codigo_item_compra`, `descricao`, `quantidade`, `valor_item`, `cnpj_vencedor` (FK)

**`participante_licitacao`** - `licitacao_id` (FK), `codigo_item_compra`, `cnpj_participante` (FK), `flag_vencedor`

`codigo_item_compra` **não** é FK para `item_licitacao`: 448 participantes por competência referenciam itens que não existem no arquivo de itens, e uma FK obrigatória descartaria justamente o dado mais valioso da fonte.

## Chave natural e idempotência

A tupla `(numero_licitacao, codigo_ug, codigo_modalidade)` é o que relaciona os três CSVs entre si, e é declarada como restrição de unicidade.

A ingestão opera por `INSERT ... ON CONFLICT DO UPDATE`: **reprocessar a mesma competência não duplica registros**. Isso atende ao requisito de prevenção de duplicados e torna o ETL seguro para repetição após falha.

Detalhe do dado real: licitações com `data_abertura` anterior ao mês do arquivo reaparecem em competências seguintes - a competência 202401 contém licitações abertas em 26/12/2023. A chave natural absorve isso naturalmente, mas significa que **linhas lidas não equivalem a licitações distintas**.

## Convenção de nomes das constraints

O `metadata` define `naming_convention`, então toda constraint recebe nome determinístico (`fk_licitacao_codigo_ug_unidade_gestora`, `uq_licitacao_numero_licitacao`).

Sem isso o `autogenerate` cria constraints anônimas e o downgrade falha com `Can't emit DROP CONSTRAINT ... it has no name` - a migration deixa de ser reversível. Há teste garantindo que nenhuma FK fica sem nome.

## Índices obrigatórios

Dado o volume (~74,8M linhas em participantes), necessários desde a primeira migration:

- `participante_licitacao`: `licitacao_id`, `cnpj_participante`
- `item_licitacao`: `licitacao_id`
- `licitacao`: `data_abertura`, `codigo_modalidade`, `competencia`
- `unidade_gestora`: `codigo_orgao`, `uf`
- `orgao`: `codigo_orgao_superior`

Particionamento de `participante_licitacao` foi avaliado e **descartado** - exigiria desnormalizar `competencia` para dentro dela, e não ajudaria os dois padrões de acesso reais. Justificativa em [[Licitações - Decisões de Modelagem]].

---

## Tabelas operacionais

**`ingestao_log`** - `competencia`, `arquivo`, `linhas_lidas`, `linhas_inseridas`, `linhas_atualizadas`, `linhas_rejeitadas`, `iniciado_em`, `finalizado_em`, `status`, `mensagem_erro`

Atende ao RF10 (registro de logs de processamento).

## Tabelas materializadas pelos jobs de ML

**`serie_mensal`** - `competencia`, `codigo_orgao`, `codigo_modalidade`, `quantidade_licitacoes`, `valor_total`, `valor_mediano`

**`execucao_modelo`** - `id`, `tipo` (`forecast`/`anomaly`), `algoritmo`, `parametros_json`, `metricas_json`, `janela_treino_inicio`, `janela_treino_fim`, `executado_em`

**`previsao`** - `execucao_id` (FK), `serie_chave`, `competencia_alvo`, `alvo` (`quantidade`/`valor`), `valor_previsto`, `ic_inferior`, `ic_superior`

O campo `serie_chave` identifica a série no formato `tipo:codigo` - `orgao:26000`, `modalidade:5`, `global`. Convenção textual que evita criar uma tabela de séries.

**`score_anomalia`** - `execucao_id` (FK), `licitacao_id` (FK), `score`, `posicao_ranking`, `features_json`

### Por que persistir `execucao_modelo`

Guardar parâmetros e métricas por rodada é o que permite afirmar na defesa "foram comparadas N configurações, com estes resultados", em vez de apresentar um número isolado sem procedência. Também é o que viabiliza a avaliação do detector de anomalias descrita em [[Licitações - Modelos Preditivos e Anomalias]].
