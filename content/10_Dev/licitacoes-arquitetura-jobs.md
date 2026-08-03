---
title: "Licitações - Arquitetura dos Jobs"
type: note
tags: [tcc, licitacoes, arquitetura, python, solid]
created: "2026-08-03"
status: ready
---

Padrão de arquitetura interna do repositório `tcc-jobs`, a camada de dados e IA do [[TCC - Sistema Inteligente para Licitações]].

A arquitetura entre camadas está em [[Licitações - Arquitetura do Sistema]]. Esta nota trata de como o código se organiza **dentro** dos jobs.

## Decisão: Functional Core, Imperative Shell

| | Responsabilidade | Como se testa |
|---|---|---|
| **Núcleo funcional** | Transformações puras: parsers, features, backtesting, métricas | Sem banco, sem rede, sem disco |
| **Casca imperativa** | I/O: download HTTP, `COPY`, leitura do banco, CLI | Integração, com PostgreSQL real |

A regra que sustenta o padrão: **nenhum módulo do núcleo importa `db/` ou `portal/`**. Um parser recebe `bytes` e devolve `LazyFrame` - não sabe de onde vieram os bytes nem para onde vai o frame.

Cada comando da CLI segue o mesmo desenho: **ler (casca) → transformar (núcleo) → escrever (casca)**.

## Por que esse padrão

Ele é o único que reconcilia três decisões já tomadas e aparentemente conflitantes:

1. **Testabilidade alta** - exigida pelo TDD e pelo RNF02.
2. **Não abstrair o Polars** - o ganho vem da avaliação *lazy*, e uma interface que devolva `DataFrame` materializado a cada etapa a elimina.
3. **Não empilhar camadas de mapeamento** - cada cópia de registro custa, e são 21,8 milhões deles.

No Functional Core, o `LazyFrame` atravessa as funções puras sem nenhuma interface no meio, e o `.collect()` acontece uma vez, na casca. Testabilidade sem custo de desempenho.

### O ganho concreto

O teste mais importante do projeto - **vazamento temporal no backtesting** - fica trivial de escrever, porque `evaluation.py` é puro: recebe série e configuração de janelas, devolve as janelas. Verifica-se que nenhuma janela de treino contém competência posterior à prevista **sem tocar em banco**.

Se o backtesting estivesse acoplado à leitura do PostgreSQL, esse teste exigiria fixture de banco, seria lento, e provavelmente não seria escrito com o rigor que o assunto pede.

## Estrutura

```
src/tcc_jobs/
├── core/              config, tipos de valor (Competencia)
├── db/                CASCA - session, models, repositories específicos
├── portal/            CASCA - fronteira com o Portal da Transparência
│   └── client.py        Protocol + implementação httpx
├── etl/
│   ├── parsers.py     NÚCLEO - bytes -> LazyFrame
│   ├── transform.py   NÚCLEO - LazyFrame -> LazyFrame
│   └── pipeline.py    CASCA  - orquestra download, parse, silver, COPY
├── ml/
│   ├── features.py    NÚCLEO
│   ├── forecast.py    NÚCLEO - série -> previsão
│   ├── anomaly.py     NÚCLEO - matriz -> scores
│   ├── evaluation.py  NÚCLEO - backtesting e métricas
│   └── runner.py      CASCA  - lê tabela, chama núcleo, grava tabela
└── cli.py             CASCA  - ponto de entrada
```

O medalhão (`bronze/`, `silver/`, `gold/`) organiza os **dados**, não o código. As duas estruturas não precisam espelhar: os parsers que produzem silver e as agregações que produzem gold compartilham vocabulário e colunas, e separá-los por camada de dado espalharia lógica coesa.

## Contratos verificados por ferramenta

O `import-linter` transforma as regras de arquitetura em teste automatizado, rodando no CI e em `make arch`:

```ini
[importlinter:contract:core-e-independente]
name = core não conhece infraestrutura
type = forbidden
source_modules = tcc_jobs.core
forbidden_modules = tcc_jobs.db, tcc_jobs.cli
```

**Isso torna o RNF01 verificável.** Antes, "arquitetura modular" era afirmação sustentada por inspeção manual - frágil de defender numa banca. Agora a violação quebra o build.

Verificado que os contratos realmente pegam: com um import de `db` inserido deliberadamente em `core/config.py`, dois dos três contratos passam a `BROKEN`. Um contrato que nunca falhou não prova nada.

Os contratos **crescem junto com o código**: cada módulo novo do núcleo entra no `.importlinter` na mesma tarefa que o cria.

## Onde o DIP entra, e só aí

Duas fronteiras justificam inversão de dependência, porque sem ela o teste exige rede:

```python
class ClientePortal(Protocol):
    def baixar(self, competencia: Competencia) -> bytes: ...
```

E uma terceira justifica por requisito - o **RNF08** pede adicionar algoritmo de ML sem tocar em `api/` nem `etl/`:

```python
class Detector(Protocol):
    def treinar(self, X: NDArray) -> None: ...
    def pontuar(self, X: NDArray) -> NDArray: ...
```

Trocar Isolation Forest por LOF passa a ser registrar outra implementação. É o OCP onde ele paga, sem espalhar abstração pelo caminho quente.

---

## Alternativas descartadas

### Clean Architecture

**Motivo: custo de cópia, com número.** Clean exige DTO em cada fronteira - `row → entity → use case output → response`. São três cópias por registro, ou **21,8 milhões × 3 alocações** em `participante_licitacao`.

O orçamento de desempenho pede carga completa em menos de 45 minutos; esse desenho o estoura sozinho. E não há domínio rico que justifique o custo: não existe `Licitacao.aprovar()` com invariantes - os dados *são* o domínio.

### Hexagonal / Ports & Adapters

Exige domínio rico para valer, e aqui geraria abstração sobre Polars e ORM justamente nos pontos onde a nota de arquitetura proíbe. O que Hexagonal traria de útil - fronteiras de I/O injetáveis - já está contemplado pelos dois Protocols acima, sem estender o padrão ao resto.

### Pipeline / DAG explícito

**Agrega de verdade:** reprocessamento parcial e observabilidade por estágio. Mas adotar Prefect ou Dagster contradiz a decisão de não trazer orquestrador, e escrever um mini-DAG é código que não é a contribuição do trabalho.

**Como os benefícios são obtidos sem o framework:** os cinco comandos da CLI já formam um DAG implícito com dependências conhecidas; o reprocessamento parcial vem da idempotência pela chave natural somada ao `ingestao_log`, que registra o que já entrou.

### Camadas por área técnica, apenas

É o que existia antes desta decisão: `etl/`, `ml/`, `db/`. Dá navegação óbvia, mas **não diz nada sobre testabilidade** - nada impede I/O de vazar para dentro de uma função de transformação, e ninguém percebe. O Functional Core mantém a navegação e acrescenta a regra que faltava.

### Vertical slices por caso de uso

Levaria a duplicação entre slices: os estágios do ETL são compartilhados por natureza, e os cinco jobs usam os mesmos parsers e as mesmas tabelas.
