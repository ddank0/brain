---
title: "Licitações - Arquitetura do Sistema"
type: note
tags: [tcc, licitacoes, arquitetura, python, php, angular, docker]
created: "2026-08-02"
status: ready
---

Arquitetura do [[TCC - Sistema Inteligente para Licitações]]. Três camadas, cada uma na linguagem onde é mais efetiva, comunicando-se apenas por contratos externos ao código.

```
┌──────────────────────┐   escreve   ┌────────────┐   lê    ┌─────────────┐  HTTP   ┌───────────┐
│  Jobs (Python)       │ ──────────► │ PostgreSQL │ ──────► │ API (PHP)   │ ──────► │  Angular  │
│  ETL, features,      │             │            │         │  Laravel    │ OpenAPI │ dashboard │
│  previsão, anomalias │             └────────────┘         └─────────────┘         └───────────┘
│  batch, offline      │
└──────────────────────┘
```

## Divisão de responsabilidades

| Camada | Linguagem | Justificativa |
|---|---|---|
| **Jobs** | Python | Única com ecossistema maduro de séries temporais e detecção de anomalias. Polars/DuckDB cobrem 91M linhas com desempenho nativo |
| **API** | PHP 8.4 / Laravel 13 | Só consulta tabelas e serializa JSON - sem impedimento técnico. Fluência do autor supera diferença de desempenho, irrelevante nesta carga |
| **Dashboard** | Angular 22 | Fluência do autor. Tipagem forte casa com cliente gerado do OpenAPI |

### Por que Python é obrigatório nos jobs

Não há em PHP equivalente maduro a SARIMAX com seleção automática de ordem, diagnóstico de resíduos e intervalos de confiança. Implementar do zero consumiria semanas em código que não é a contribuição do trabalho e cuja correção seria difícil de defender. O mesmo, em menor grau, vale para transformar 74,8M linhas: PHP não tem equivalente a Polars, e o processamento recairia em laço interpretado.

### Custo assumido

- Três toolchains: `uv`, `composer`, `npm`
- Três Dockerfiles e três suítes de teste
- Três ferramentas de análise estática a manter
- **Definição do esquema duplicada** entre SQLAlchemy (jobs) e Eloquent (API) - mitigada pela propriedade única do Alembic e por teste de contrato

Aceito porque a fluência do autor nas camadas de interface reduz o tempo de desenvolvimento mais do que a duplicação o aumenta.

O desenvolvimento é **container-first**: o host precisa apenas de Docker, e as três toolchains vivem nas imagens. Isso elimina divergência de versão entre máquina e container - ver [[Licitações - Ambiente de Desenvolvimento]].

---

## Contratos entre camadas

O que sobrevive a uma troca de linguagem não são abstrações internas de código, e sim os contratos externos. Cada um é artefato versionado.

| Contrato | Formato | Proprietário |
|---|---|---|
| Esquema do banco | Migrations Alembic | **Jobs (Python)** |
| Dados intermediários | Parquet com esquema documentado | Jobs |
| Interface da API | `openapi.json` versionado no repositório | API (PHP) |

### Propriedade única do esquema

Alembic é o **único** sistema de migrations do projeto. As migrations do Laravel ficam desabilitadas; o Eloquent aponta para tabelas existentes.

**Motivo:** dois sistemas versionando o mesmo banco, cada um com sua tabela de controle, produzem conflito garantido. Quem cria e popula as tabelas define a estrutura; a API é consumidora.

### OpenAPI como artefato de primeira classe

A especificação é exportada para o repositório a cada alteração de contrato, não tratada como subproduto. O cliente TypeScript do Angular é **gerado** dela (`openapi-generator`), eliminando duplicação entre front e API e mantendo os dois sincronizados por construção.

### Substituibilidade

Cada seta do diagrama é um formato aberto. Reescrever a API em Go significa implementar o mesmo OpenAPI sobre as mesmas tabelas - nada mais muda. Reescrever o ETL em Rust significa produzir os mesmos Parquet com o mesmo esquema.

**Custo desta portabilidade em desempenho: zero.** Não há indireção adicional em tempo de execução; é disciplina sobre onde as fronteiras ficam.

### Onde *não* desacoplar

Três abstrações degradariam o desempenho sem oferecer portabilidade real:

1. **Interface genérica sobre o Polars.** O ganho vem da avaliação *lazy*, em que o motor enxerga o encadeamento inteiro e otimiza. Uma interface que devolva `DataFrame` materializado a cada etapa elimina isso. **Regra:** `LazyFrame` atravessa as funções; `.collect()` é chamado uma vez, ao final.
2. **Repositório genérico na leitura em massa.** Um `get_all() -> list[Entidade]` que instancia centenas de milhares de objetos ORM é ordens de magnitude mais lento que projeção direta das colunas necessárias.
3. **Camadas de mapeamento empilhadas.** `row → domínio → DTO → JSON` faz três cópias de cada registro. Em endpoints analíticos, ir da consulta direto ao recurso de resposta.

**Regra geral:** desacoplar nas fronteiras de dado (banco, arquivo, HTTP); não desacoplar dentro do caminho quente de processamento.

A organização interna dos jobs que materializa essa regra é **Functional Core, Imperative Shell**, com contratos verificados por `import-linter` - ver [[Licitações - Arquitetura dos Jobs]].

---

## Stack

| Camada | Tecnologia | Critério decisivo |
|---|---|---|
| Gerenciador Python | **uv** | Resolução e instalação em segundos; lockfile confiável |
| Formato intermediário | **Parquet** | Colunar e comprimido; ~800 MB de CSV → ~100-150 MB |
| Transformação | **Polars** | Execução paralela e *lazy*; motor em Rust |
| Exploração ad-hoc | **DuckDB** | SQL direto sobre Parquet; fora do caminho crítico |
| Banco | **PostgreSQL 16** | Especificado no documento original; funções de janela nativas |
| ORM/migrations | **SQLAlchemy 2.0 + Alembic** | Proprietário do esquema |
| Carga em massa | **`COPY` via psycopg3** | Minutos em vez de horas para 74,8M linhas |
| Séries temporais | **statsforecast** (+ statsmodels no diagnóstico) | AutoARIMA compilado com Numba |
| Anomalias | **scikit-learn** | `IsolationForest` e `LocalOutlierFactor` nativos |
| API | **PHP 8.4.24 / Laravel 13.23** | Fluência do autor |
| Dashboard | **Angular 22.1 + TypeScript 6.0** (Material e ECharts no Plano 06) | Fluência do autor; cliente gerado do OpenAPI |
| Contêineres | **Docker + Docker Compose** | RNF05 |
| Testes | **pytest**, **PHPUnit**, **Vitest** | Padrões de cada ecossistema |
| Análise estática | **Pyright** strict, **PHPStan** nível 10 + Larastan, **ESLint** strictTypeChecked | Ver [[Licitações - Qualidade e Integração Contínua]] |
| Banco (versão) | **PostgreSQL 16** | - |
| Python (versão) | **3.14.6** | Mais recente estável; suporte até 2030 |
| Node (versão) | **24.18.1** | LTS ativa; Angular 22 declara `^24.15.0` |

### Nota sobre o desempenho do Python

Polars é escrito em Rust, DuckDB em C++, NumPy em C, scikit-learn em Cython, e statsforecast compila com Numba/LLVM. Ao processar 74,8 milhões de registros, os dados **não passam pelo interpretador Python** - ele apenas monta o plano de execução. O custo de interpretação incide sobre dezenas de chamadas de função, não sobre milhões de linhas.

Consequência de projeto: **não escrever laços em Python sobre registros**. Toda transformação em operações vetorizadas do Polars.

### Nota sobre o desempenho da API em PHP

Em benchmark sintético, runtimes compilados superam PHP em ordem de grandeza. Irrelevante aqui: a API lê tabelas materializadas, e o tempo de resposta é dominado pela consulta ao PostgreSQL e pela rede. Numa requisição que gasta 20 ms em banco, a diferença de runtime é invisível. A carga real é de poucos usuários simultâneos.

---

## Alternativas de arquitetura consideradas

### Escolhida - jobs em lote com resultados materializados

Treino e inferência executam **offline via linha de comando** e gravam previsões e scores como **tabelas**. A API lê apenas tabelas e nunca invoca modelo.

- Respostas em milissegundos, sem cache adicional
- Reprocessamento e comparação entre execuções são triviais
- Histórico auditável de scores - pré-requisito para avaliar o detector
- Jobs podem demorar horas sem afetar o tempo de resposta

### Microsserviços - descartada

Converter cada job em serviço HTTP de longa duração.

1. **Natureza do problema.** Microsserviços resolvem deploy independente entre times e escalonamento sob carga de requisições. O processamento é em lote, feito por uma pessoa - nenhum dos dois problemas existe.
2. **Banco compartilhado.** Os jobs trocam gigabytes; transportar isso por HTTP é inviável. Continuariam compartilhando banco e filesystem, configurando o anti-padrão do banco compartilhado - custo operacional de sistemas distribuídos sem o benefício do isolamento de dados. Isto é um **monolito distribuído**.
3. **Custo.** De 3 para 8-10 contêineres, exigindo fila, broker, orquestrador, healthchecks e rastreamento distribuído. Estimativa de 3-5 semanas, subtraídas da avaliação de modelos.
4. **Isolamento já existe.** Os jobs são processos independentes, sem memória compartilhada, comunicando por contrato de dados. A única diferença para um microsserviço é o servidor HTTP - que traz todo o custo e nenhum benefício aqui.

O documento original do TCC já classifica microsserviços como evolução futura.

### Camada analítica SQL versionada, estilo dbt - descartada

Renderia capítulo sobre modelagem dimensional, ao custo de 2-3 semanas subtraídas da avaliação de modelos. A arquitetura medalhão captura parte do benefício sem esse custo.

### Computação sob demanda na API - rejeitada

A API ajustaria os modelos no momento da requisição. **Inviável:** o ajuste de um SARIMA leva de segundos a minutos, estourando qualquer timeout de HTTP. Registrada para descarte fundamentado na monografia.

### Spark - descartada

**Motivo: dimensionamento.** Spark resolve dados que não cabem em uma máquina - tipicamente centenas de GB. O volume aqui é de 1-2 GB. Rodando localmente, como se faz em TCC, paga-se JVM, configuração e depuração distribuída sem receber o benefício, pois continua sendo uma máquina só.

A escolha por Polars/DuckDB não abre mão de desempenho: ambos são nativos (Rust e C++). A decisão demonstra **critério de dimensionamento**, argumento mais defensável em banca que ferramenta desproporcional ao problema.

---

## Estrutura do projeto

```
.
├── docker-compose.yml
├── jobs/                          # Python - batch
│   ├── pyproject.toml             # uv
│   ├── Dockerfile
│   ├── alembic.ini
│   ├── src/tcc_jobs/
│   │   ├── core/                  # config, logging
│   │   ├── db/
│   │   │   ├── models/            # SQLAlchemy - proprietário do esquema
│   │   │   └── migrations/        # Alembic
│   │   ├── etl/
│   │   │   ├── download.py        # → bronze/
│   │   │   ├── parsers.py         # latin-1, ";", decimal "," → silver/
│   │   │   ├── loaders.py         # COPY → PostgreSQL
│   │   │   └── pncp.py            # conector bônus
│   │   ├── ml/
│   │   │   ├── features.py
│   │   │   ├── forecast.py        # statsforecast
│   │   │   ├── anomaly.py         # scikit-learn
│   │   │   └── evaluation.py      # backtesting e métricas
│   │   └── cli.py                 # Typer - 5 comandos
│   └── tests/
├── api/                           # PHP 8.4 / Laravel 13
│   ├── composer.json
│   ├── Dockerfile
│   ├── app/
│   │   ├── Models/                # Eloquent - somente leitura
│   │   ├── Http/Controllers/
│   │   └── Http/Resources/
│   ├── routes/api.php
│   ├── openapi.json               # contrato versionado
│   └── tests/
├── frontend/                      # Angular
│   ├── package.json
│   ├── Dockerfile
│   ├── src/app/
│   │   ├── core/api/              # gerado do openapi.json
│   │   ├── features/              # 5 telas
│   │   └── shared/
│   └── ...
├── data/                          # volume Docker
│   ├── bronze/                    # ZIPs originais, imutáveis
│   ├── silver/                    # Parquet limpo
│   └── gold/                      # agregados e features
├── brain/                         # este vault
└── initial_idea_doc/
```

### Regras de dependência

1. **A API não importa código dos jobs, e vice-versa.** São linguagens distintas; o contato é o esquema do banco.
2. **O frontend não conhece o banco.** Só HTTP com a API.
3. **`etl/` e `ml/` são acionados somente por `cli.py`.** Nunca por requisição HTTP.
4. **Dentro dos jobs, `ml/` não importa `etl/`.** Comunicam-se por Parquet e por tabelas.

### Imagens separadas

Cada camada tem Dockerfile próprio. A imagem dos jobs carrega Polars, scikit-learn e statsforecast (~1 GB); a da API e a do frontend não precisam disso e ficam menores, com inicialização mais rápida e menor superfície de ataque.

---

## API REST

Todos os endpoints leem tabelas. Nenhum executa modelo.

| Método | Rota | Descrição | RF |
|---|---|---|---|
| GET | `/licitacoes` | Consulta paginada: órgão, modalidade, UF, período, situação, faixa de valor | RF04 |
| GET | `/licitacoes/{id}` | Detalhe com itens e participantes | RF04 |
| GET | `/analytics/evolucao-temporal` | Série de quantidade e valor por competência | RF05 |
| GET | `/analytics/ranking-orgaos` | Órgãos por volume financeiro | RF05 |
| GET | `/analytics/ranking-fornecedores` | Fornecedores por valor vencido | RF05 |
| GET | `/analytics/distribuicao-modalidades` | Participação por modalidade | RF05 |
| GET | `/forecast` | Previsões com intervalo de confiança | RF06 |
| GET | `/anomalies` | Registros ranqueados por score | RF07 |
| GET | `/anomalies/{id}` | Score com contribuição dos atributos | RF07 |
| GET | `/health` | Estado do serviço e da última ingestão | RF10 |

CORS habilitado para a origem do frontend.

---

## Orçamento de desempenho

Alvos verificáveis, para que "está rápido" seja medição e não impressão:

| Operação | Alvo | Medido |
|---|---|---|
| `load` das 136 competências | < 45 min | **62 min** - alvo perdido |
| `aggregate` completo | < 5 min | **10 s** |
| `train` de todas as séries | < 30 min | não medido |
| `score` completo | < 10 min | não medido |
| Endpoints de consulta (p95) | < 300 ms | não medido |
| Endpoints analíticos (p95) | < 500 ms | não medido |
| Carga inicial de uma tela do dashboard | < 2 s | não medido |

Se um alvo for perdido, a causa provável é abstração indevida no caminho quente - ver "Onde não desacoplar", acima.

### O alvo da carga foi perdido, e não por lentidão

Os 45 minutos foram orçados para 29 milhões de linhas. A carga real moveu **91 milhões** - a estimativa de volume errava por 3,1x, e o motivo está em [[Licitações - Fontes de Dados Públicos]].

Normalizando pelo que de fato foi processado:

| | Previsto | Realizado |
|---|---|---|
| Linhas | 29 milhões | 91 milhões |
| Tempo | 45 min | 62 min |
| Vazão | 10.700 linhas/s | **24.500 linhas/s** |

O pipeline entrega **2,3x a vazão orçada por linha**. O alvo caiu porque o denominador estava errado, não porque o caminho quente degradou.

O alvo fica **revisado para 75 minutos**, com a vazão de 24.500 linhas/s como a métrica que realmente vale acompanhar - ela não depende de o volume da fonte ter sido bem estimado. A carga é operação única e offline; 62 minutos não estão no caminho de nenhum usuário.
