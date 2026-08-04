---
title: "Licitações - Requisitos"
type: note
tags: [tcc, licitacoes, requisitos, rastreabilidade]
created: "2026-08-02"
status: ready
---

Requisitos do [[TCC - Sistema Inteligente para Licitações]], com critério de aceitação verificável para cada um.

Os enunciados vêm literalmente do PDF original (`initial_idea_doc/`, seções 9 e 10). Eles são de uma frase, portanto não verificáveis por si - "tempo de resposta adequado" não diz o que é adequado. A coluna **critério de aceitação** é o que torna cada requisito testável, e é o que a banca cobra.

O campo `Requisito` do [board do projeto](https://github.com/users/ddank0/projects/2) referencia os códigos desta nota.

---

## Requisitos funcionais

| # | Enunciado (PDF) | Critério de aceitação | Plano | Status |
|---|---|---|---|---|
| **RF01** | Importar dados públicos | `tcc ingest --de 201301 --ate 202404` baixa as 136 competências para `bronze/` e grava Parquet em `silver/`, com uma linha em `ingestao_log` por arquivo | 02 | pendente |
| **RF02** | Normalizar informações | Parsers convertem `latin-1`, decimal com vírgula, datas `DD/MM/AAAA` e `SIM`/`NÃO`. Teste automatizado cobre as seis armadilhas de formato | 02 | pendente |
| **RF03** | Armazenar dados no banco | 12 tabelas criadas por migration, em 3FN. ~342 mil licitações, ~7M itens e ~21,8M participantes carregados. Reprocessar a mesma competência não duplica registros | 01, 02 | **parcial** - esquema e chave natural prontos e testados; carga no Plano 02 |
| **RF04** | Consultar licitações | `GET /licitacoes` paginado, com filtros de órgão, modalidade, UF, período, situação e faixa de valor. `GET /licitacoes/{id}` traz itens e participantes | 03 | pendente |
| **RF05** | Executar análises históricas | Quatro endpoints `/analytics/*` respondendo a partir de `serie_mensal`: evolução temporal, ranking de órgãos, ranking de fornecedores, distribuição por modalidade | 03 | pendente |
| **RF06** | Gerar previsões | Tabela `previsao` populada com intervalo de confiança. MAE, RMSE e MAPE gravados em `execucao_modelo` **e comparados ao baseline sazonal ingênuo**. Backtesting com janela deslizante, com teste automatizado provando ausência de vazamento temporal | 04 | pendente |
| **RF07** | Detectar anomalias | Tabela `score_anomalia` populada por Isolation Forest e LOF. Avaliação nas três frentes: anomalias sintéticas com precisão e recall medidos, concordância entre os dois métodos, e análise escrita dos 20 primeiros | 05 | pendente |
| **RF08** | Disponibilizar API REST | Dez endpoints no ar. `openapi.json` versionado no repositório e atualizado a cada mudança de contrato. Testes de contrato validando as respostas | 03 | pendente |
| **RF09** | Exibir dashboard interativo | Cinco telas consumindo a API por HTTP. Tela de anomalias com aviso permanente de não-fraude. Previsão exibida com banda de confiança, nunca só a linha central | 06 | pendente |
| **RF10** | Registrar logs de processamento | `ingestao_log` com linhas lidas, inseridas, atualizadas e rejeitadas, mais status e mensagem de erro por arquivo. `GET /health` expõe a última ingestão | 01, 02 | **parcial** - tabela criada; preenchimento no Plano 02 |

## Requisitos não funcionais

| # | Enunciado (PDF) | Critério de aceitação | Plano | Status |
|---|---|---|---|---|
| **RNF01** | Arquitetura modular | As seis regras de dependência valem e são verificáveis: `tcc-api` não importa `tcc-jobs`, o frontend não conhece o banco, `etl/` e `ml/` só são acionados por CLI. A separação em repositórios torna a violação impossível por construção. **Dentro dos jobs, `import-linter` no CI garante que o núcleo funcional não importa infraestrutura** | 01 | **atendido** - verificável por ferramenta |
| **RNF02** | Código de fácil manutenção | `ruff`, `Pint` e `ESLint` sem erro **mais análise estática no nível máximo**: Pyright strict, PHPStan nível 10, ESLint strictTypeChecked. CI verde nos três repositórios. Cobertura de ao menos 80% em `etl/` e `ml/` | 01, 07 | **parcial** - ferramentas ativas e CI verde; cobertura das camadas de dados depende dos Planos 02-05 |
| **RNF03** | API documentada automaticamente | `/docs` renderiza a especificação. `openapi.json` versionado. O cliente TypeScript do Angular é **gerado** desse arquivo, não escrito à mão | 03 | pendente |
| **RNF04** | Banco versionado por migrations | `alembic upgrade head` e `alembic downgrade base` funcionam nos dois sentidos, com teste automatizado. Nenhuma migration do Laravel existe. `alembic check` no CI detecta modelo alterado sem migration | 01 | **atendido** |
| **RNF05** | Containerização via Docker | `docker compose up -d` sobe PostgreSQL, API e dashboard. `curl /api/health` devolve `{"status":"ok","database":"ok"}`. Estágios de produção verificados no CI | 01 | **atendido** |
| **RNF06** | Tempo de resposta adequado para consultas | **Medido, não estimado.** Endpoints de consulta com p95 < 300 ms, analíticos < 500 ms, carga inicial de tela < 2 s. Carga completa das 136 competências em menos de 45 min | 03, 06 | pendente |
| **RNF07** | Segurança no acesso à aplicação | **Atendimento parcial declarado.** Segredos em variáveis de ambiente; `git ls-files \| grep '\.env$'` vazio nos cinco repositórios. Autenticação de usuários está fora de escopo | 01 | **parcial** - conforme decidido |
| **RNF08** | Facilidade para inclusão de novos modelos de IA | Adicionar algoritmo em `ml/` não exige alteração em `api/` nem em `etl/`. Demonstrado na prática: o LOF entra ao lado do Isolation Forest sem tocar nas outras camadas | 05 | pendente |

---

## Requisitos que exigiram interpretação

Três enunciados do PDF não eram verificáveis como escritos. O que foi decidido:

**RNF02 - "código de fácil manutenção".** Manutenibilidade não se mede por opinião. Traduzido em lint sem erro, CI verde e piso de cobertura de 80% nas camadas onde bug silencioso é mais caro (`etl/`, onde um parser errado contamina toda a base, e `ml/`, onde um erro de avaliação invalida as conclusões). O piso de 80% é meta assumida, não imposição externa - vale revisar com o orientador. Desde a implementação, o critério ganhou a análise estática no nível máximo de cada ecossistema, detalhada em [[Licitações - Qualidade e Integração Contínua]].

**RNF06 - "tempo de resposta adequado".** "Adequado" não é critério. Os números vêm do orçamento de desempenho em [[Licitações - Arquitetura do Sistema]] e precisam ser **medidos** na entrega, não estimados. Perder um alvo é resultado reportável; não medir é lacuna.

**RNF07 - "segurança no acesso à aplicação".** O enunciado sugere controle de acesso, mas autenticação de usuários está fora do escopo do MVP. O requisito fica **parcialmente atendido**, e isso está declarado em vez de maquiado. Se a banca cobrar, a decisão está registrada com justificativa de prazo, não esquecida.

## Requisito com risco de leitura equivocada

**RF07 - "detectar anomalias".** O verbo detectar sugere veredito. O sistema não emite veredito: calcula desvio estatístico em relação ao histórico. A distinção é implementada, não apenas escrita - o vocabulário exposto é `score` e `posicao_ranking`, a tela traz aviso permanente, e a resposta da API inclui a contribuição de cada atributo para o sinal ser contestável. Ver [[Licitações - Modelos Preditivos e Anomalias]].

---

## Onde cada requisito é detalhado

| Nota | Requisitos |
|---|---|
| [[Licitações - Pipeline de Dados]] | RF01, RF02, RF10 |
| [[Licitações - Modelo de Dados]] | RF03, RF10 |
| [[Licitações - Arquitetura do Sistema]] | RF04, RF05, RF08, RNF01, RNF03, RNF06 |
| [[Licitações - Modelos Preditivos e Anomalias]] | RF06, RF07, RNF08 |
| [[Licitações - Plano 01 - Fundação]] | RNF01, RNF04, RNF05 |
| [[Licitações - Qualidade e Integração Contínua]] | RNF02 |
| [[Licitações - Arquitetura dos Jobs]] | RNF01, RNF08 |
| [[TCC - Sistema Inteligente para Licitações]] | RF09, escopo do dashboard |

## Convenção de status

`pendente` · `em andamento` · `atendido` · `parcial` (com a lacuna declarada) · `cortado` (com a justificativa)

Atualizar esta nota ao concluir cada plano. É ela, e não o board, que vai para a monografia.
