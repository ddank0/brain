---
title: "Licitações - Pipeline de Dados"
type: note
tags: [tcc, licitacoes, etl, polars, parquet, duckdb]
created: "2026-08-02"
status: ready
---

Pipeline de ingestão e transformação do [[TCC - Sistema Inteligente para Licitações]]. Fonte e formato dos arquivos em [[Licitações - Fontes de Dados Públicos]].

## Arquitetura medalhão

```
bronze/   ZIPs e CSVs exatamente como baixados - nunca modificados
silver/   Parquet limpo: tipos corretos, datas convertidas, SIM/NÃO → booleano
gold/     Agregados prontos: serie_mensal, matriz de features
   ↓
PostgreSQL   ← carga do que a API precisa servir
```

A regra que sustenta a reprodutibilidade: **bronze é imutável**. Descobrir na semana 12 que uma data foi convertida errado exige reprocessar a partir de bronze, sem baixar de novo 135 arquivos.

---

## Os cinco jobs

| Comando | Entrada → Saída | Por que é separado |
|---|---|---|
| `ingest` | Portal → `bronze/` → `silver/` | Download é I/O de rede e falha por competência; separar o parse permite reprocessar sem rebaixar |
| `load` | `silver/` → PostgreSQL | Carga em massa via `COPY`; repetida a cada mudança de esquema |
| `aggregate` | PostgreSQL → `gold/` + `serie_mensal` | Muda muito durante a experimentação de features; precisa ser barato repetir |
| `train` | `serie_mensal` → `previsao`, `execucao_modelo` | Treino é lento; nunca deve rodar junto de outra etapa |
| `score` | features → `score_anomalia` | Roda mais vezes que o treino, testando configurações de detector |

```bash
uv run tcc ingest --de 201301 --ate 202404
uv run tcc load --de 201301 --ate 202404
uv run tcc aggregate
uv run tcc train --serie orgao
uv run tcc score
```

Todos idempotentes e parametrizados por competência. Por isso, qualquer orquestrador externo - cron, Prefect, Airflow - pode acioná-los no futuro **sem reescrita**. A escalabilidade vem da interface, não da infraestrutura.

---

## Fluxo detalhado

```
ZIP mensal (AAAAMM)
      │
      ▼
parse  (latin-1, sep=";", decimal=",", datas DD/MM/AAAA)
      │
      ▼
validação  (tipos, obrigatoriedade, faixas) ──► rejeitados → ingestao_log
      │
      ▼
upsert por chave natural  (idempotente)
      │
      ▼
agregação → serie_mensal + features
```

---

## Armadilhas do formato

Documentadas a partir da inspeção do dado real - evitam horas de depuração:

1. **Codificação `latin-1`.** Leitura como UTF-8 falha nos acentos de nomes de órgãos.
2. **Decimal com vírgula.** `170612,0000` exige conversão explícita.
3. **Competências vazias.** `202401_EmpenhosRelacionados.csv` veio sem linhas. Arquivo vazio é caso normal, não erro.
4. **Competência truncada.** `202404` tem volume anômalo por encerrar a série (832 KB contra ~2,8 MB). Deve ser sinalizada, sob risco de ser lida como queda real de atividade.
5. **Booleanos textuais.** `Flag Vencedor` vem como `SIM`/`NÃO`, com acento em `latin-1`.
6. **Licitações em múltiplas competências.** Registros com `data_abertura` anterior ao mês do arquivo reaparecem depois. A chave natural absorve - ver [[Licitações - Modelo de Dados]].

---

## Decisões de desempenho

**`COPY` em vez de ORM na carga.** Inserir 21,8M linhas via SQLAlchemy ORM levaria horas; via `COPY` do PostgreSQL com `psycopg3`, minutos. ORM fica reservado para dimensões e para o caminho transacional.

**`LazyFrame` atravessa as funções.** O ganho do Polars vem da avaliação *lazy* - o motor enxerga o encadeamento inteiro e otimiza, eliminando colunas não usadas e empurrando filtros para a leitura. Materializar a cada etapa mata isso. `.collect()` é chamado uma vez, ao final.

**Sem laços Python sobre registros.** Toda transformação em operações vetorizadas. Ver a nota sobre desempenho em [[Licitações - Arquitetura do Sistema]].

**DuckDB para exploração.** Durante a engenharia de atributos, consultar os Parquet diretamente em SQL é mais rápido que carregar em tabela:

```sql
SELECT modalidade, COUNT(*), AVG(valor)
FROM 'silver/licitacao/*.parquet'
WHERE valor > 0
GROUP BY modalidade
```

Fora do caminho crítico do pipeline - ferramenta de análise, não de produção.
