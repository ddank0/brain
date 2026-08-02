---
title: "Licitações — Modelo de Dados"
type: note
tags: [tcc, licitacoes, postgresql, modelagem, sql]
created: "2026-08-02"
status: ready
---

Esquema do banco do [[TCC — Sistema Inteligente para Licitações]]. Proprietário único: Alembic, do lado dos jobs em Python — ver [[Licitações — Arquitetura do Sistema]].

## Dimensões

| Tabela | Campos |
|---|---|
| `orgao` | `codigo_orgao` (PK), `nome`, `codigo_orgao_superior`, `nome_orgao_superior` |
| `unidade_gestora` | `codigo_ug` (PK), `nome`, `codigo_orgao` (FK) |
| `fornecedor` | `cnpj` (PK), `nome` |

## Fatos

**`licitacao`** — `id` (PK sintética), `numero_licitacao`, `codigo_ug`, `codigo_modalidade`, `modalidade`, `numero_processo`, `objeto`, `situacao`, `uf`, `municipio`, `data_abertura`, `data_resultado`, `valor` `NUMERIC(18,4)`, `competencia`

**`item_licitacao`** — `licitacao_id` (FK), `codigo_item_compra`, `descricao`, `quantidade`, `valor_item`, `cnpj_vencedor` (FK)

**`participante_licitacao`** — `licitacao_id` (FK), `codigo_item_compra`, `cnpj_participante` (FK), `flag_vencedor`

## Chave natural e idempotência

A tupla `(numero_licitacao, codigo_ug, codigo_modalidade)` é o que relaciona os três CSVs entre si, e é declarada como restrição de unicidade.

A ingestão opera por `INSERT ... ON CONFLICT DO UPDATE`: **reprocessar a mesma competência não duplica registros**. Isso atende ao requisito de prevenção de duplicados e torna o ETL seguro para repetição após falha.

Detalhe do dado real: licitações com `data_abertura` anterior ao mês do arquivo reaparecem em competências seguintes — a competência 202401 contém licitações abertas em 26/12/2023. A chave natural absorve isso naturalmente, mas significa que **linhas lidas não equivalem a licitações distintas**.

## Índices obrigatórios

Dado o volume (~21,8M linhas em participantes), necessários desde a primeira migration:

- `participante_licitacao`: `licitacao_id`, `cnpj_participante`
- `item_licitacao`: `licitacao_id`
- `licitacao`: `codigo_orgao`, `data_abertura`, `codigo_modalidade`

---

## Tabelas operacionais

**`ingestao_log`** — `competencia`, `arquivo`, `linhas_lidas`, `linhas_inseridas`, `linhas_atualizadas`, `linhas_rejeitadas`, `iniciado_em`, `finalizado_em`, `status`, `mensagem_erro`

Atende ao RF10 (registro de logs de processamento).

## Tabelas materializadas pelos jobs de ML

**`serie_mensal`** — `competencia`, `codigo_orgao`, `codigo_modalidade`, `quantidade_licitacoes`, `valor_total`, `valor_mediano`

**`execucao_modelo`** — `id`, `tipo` (`forecast`/`anomaly`), `algoritmo`, `parametros_json`, `metricas_json`, `janela_treino_inicio`, `janela_treino_fim`, `executado_em`

**`previsao`** — `execucao_id` (FK), `serie_chave`, `competencia_alvo`, `alvo` (`quantidade`/`valor`), `valor_previsto`, `ic_inferior`, `ic_superior`

O campo `serie_chave` identifica a série no formato `tipo:codigo` — `orgao:26000`, `modalidade:5`, `global`. Convenção textual que evita criar uma tabela de séries.

**`score_anomalia`** — `execucao_id` (FK), `licitacao_id` (FK), `score`, `posicao_ranking`, `features_json`

### Por que persistir `execucao_modelo`

Guardar parâmetros e métricas por rodada é o que permite afirmar na defesa "foram comparadas N configurações, com estes resultados", em vez de apresentar um número isolado sem procedência. Também é o que viabiliza a avaliação do detector de anomalias descrita em [[Licitações — Modelos Preditivos e Anomalias]].
