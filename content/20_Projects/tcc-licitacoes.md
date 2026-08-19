---
title: "TCC - Sistema Inteligente para Licitações"
type: project
tags: [tcc, licitacoes, dados, ia]
created: "2026-08-02"
status: active
goal: "Coletar licitações públicas federais, prever tendências por séries temporais e sinalizar registros atípicos, expondo tudo via API e dashboard"
stack: [python, polars, postgresql, php, laravel, angular, docker, pyright, phpstan]
---

Trabalho de Conclusão de Curso. Sistema que coleta dados públicos de licitações federais, organiza em base estruturada, produz previsões por séries temporais e sinaliza registros estatisticamente atípicos.

O sistema é **analítico e preditivo**. Não substitui auditoria nem caracteriza fraude - identifica registros que se afastam do padrão histórico e merecem análise humana. Ver [[Licitações - Modelos Preditivos e Anomalias]].

---

## Notas do projeto

| Nota | Conteúdo |
|------|----------|
| [[Licitações - Requisitos]] | RF01-RF10 e RNF01-RNF08, com critério de aceitação e status |
| [[Licitações - Fontes de Dados Públicos]] | Investigação do PNCP e Portal da Transparência, com evidências |
| [[Licitações - Arquitetura do Sistema]] | Divisão poliglota, contratos entre camadas, alternativas descartadas |
| [[Licitações - Arquitetura dos Jobs]] | Functional Core, Imperative Shell; contratos por import-linter |
| [[Licitações - Modelo de Dados]] | Dimensões, fatos, chave natural, índices |
| [[Licitações - Decisões de Modelagem]] | Por que o esquema é assim; dependências funcionais medidas |
| [[Licitações - Pipeline de Dados]] | Medalhão, os cinco jobs, armadilhas do formato |
| [[Licitações - Modelos Preditivos e Anomalias]] | SARIMA, Isolation Forest, avaliação sem rótulos |
| [[Licitações - Qualidade e Integração Contínua]] | Análise estática, TDD por camada, pipelines |
| [[Licitações - Ambiente de Desenvolvimento]] | Container-first e armadilhas de ambiente |
| [[Licitações - Plano 01 - Fundação]] | Semanas 1-2, **concluído** |
| [[Licitações - Plano 02 - ETL]] | Semanas 3-5, **concluído** |
| [[Licitações - Plano 03 - API]] | Semana 6, **concluído** |
| [[Licitações - Plano 04 - Previsão]] | Semanas 7-9, **concluído** |
| [[Licitações - Plano 05 - Anomalias]] | Semanas 10-12, **em andamento** |

---

## Restrições

| Restrição | Consequência |
|---|---|
| ~1 semestre (16 semanas) | Escopo priorizado; um item classificado como bônus |
| Execução individual | Sem paralelização de trabalho |
| Banca valoriza sistema **e** IA em equilíbrio | Nem notebook solto, nem CRUD sem rigor estatístico |
| Reprodutibilidade na defesa | Fontes estáveis preferidas a fontes "ao vivo" |
| Autor é dev pleno em PHP e Angular | Justifica a arquitetura poliglota |

## Critérios de sucesso

1. Pipeline fim-a-fim executável com `docker compose up`.
2. Base carregada com o histórico completo disponível: 136 competências, de `201301` a `202404`.
3. Previsões com erro medido **contra baseline**, não em termos absolutos.
4. Detector de anomalias com avaliação defensável apesar da ausência de rótulos.
5. Resultados navegáveis por não-programador.
6. Cada camada substituível sem reescrita das demais.

---

## Cronograma

| Semanas | Entrega | Requisitos | Status |
|---|---|---|---|
| 1-2 | Docker Compose, PostgreSQL, Alembic, esqueleto das três stacks | RNF01, RNF04, RNF05 | **concluído** |
| 3-5 | ETL em Python: download, parse, `COPY`, medalhão; carga de 201301-202404 | RF01, RF02, RF03, RF10 | **concluído** - 91M linhas em 24,6 min |
| 6 | API em Laravel: consulta e análise histórica; exportação do OpenAPI | RF04, RF05, RF08, RNF03 | **concluído** - 10 endpoints, p95 medido |
| 7-9 | SARIMA, backtesting, baseline, seleção de parâmetros | RF06 | **concluído** - 23.730 avaliações, sem vazamento |
| 10-12 | Features, Isolation Forest, LOF, avaliação em três frentes | RF07 | plano escrito |
| 13-15 | Dashboard Angular, cinco telas | RF09 | - |
| 16 | Testes finais, README, redação | RNF02 | - |
| **Bônus** | Conector PNCP, se houver tempo residual | - | - |

Acompanhamento por cards em [github.com/users/ddank0/projects/2](https://github.com/users/ddank0/projects/2), com campos de semana, camada e requisito.

A API recebe uma semana por ser a camada de maior fluência do autor e a de menor complexidade - leitura e serialização, sem lógica estatística.

### Ordem de corte

Se o prazo apertar, cortar nesta ordem:

1. Conector PNCP (já é bônus)
2. Telas 3 e 4 do dashboard, consolidando gráficos na visão geral
3. Experimentação de configurações adicionais de previsão

**Não cortar:** a avaliação de anomalias. É o que sustenta a contribuição do trabalho.

---

## Escopo do dashboard

Cinco telas. O dashboard demonstra o sistema; não é um produto.

1. **Visão geral** - indicadores agregados
2. **Consulta de licitações** - tabela com filtros
3. **Análise histórica** - evolução, rankings, distribuição
4. **Previsões** - série observada e prevista, com intervalo de confiança
5. **Anomalias** - ranking, detalhe, contribuição dos atributos, aviso de não-fraude

O cliente HTTP é **gerado** do OpenAPI, não escrito à mão.

---

## Riscos

| Risco | Prob. | Impacto | Mitigação |
|---|---|---|---|
| Banca questiona recorte até abr/2024 | Média | Alto | Conector PNCP como bônus; descontinuidade regulatória documentada como achado |
| Três toolchains atrasam a fase inicial | Média | Médio | Semanas 1-2 dedicadas a infra; fluência em duas das três |
| Esquema duplicado (SQLAlchemy/Eloquent) diverge | Média | Médio | Alembic como proprietário único; testes de contrato |
| Carga excede o orçamento | Baixa | Baixo | Ocorreu e foi resolvido: 62 min viraram 24,6 ao mover a remoção das FKs para o escopo do lote. O alvo de 45 min é cumprido com 91M linhas, 3,1x a estimativa. Ver [[Licitações - Arquitetura do Sistema]] |
| SARIMA não supera o baseline | - | - | **Medido no backtesting completo:** empate na mediana geral, vitória clara nas séries grandes (MASE 0,879-0,967 no top-10%; MAE de valor cai à metade). A preliminar que apontava derrota era artefato de janela única. Ver [[Licitações - Modelos Preditivos e Anomalias]] |
| Anomalias sem validação convincente | Média | Alto | Três frentes de avaliação; limitação declarada |
| Estouro de prazo | Média | Alto | Ordem de corte pré-definida |

---

## Fora de escopo

Alinhado às evoluções futuras do documento original: ingestão em tempo real, autenticação e perfis, alertas por e-mail, mapas geográficos, XAI/SHAP formal, treinamento contínuo, microsserviços, processamento distribuído, e modelos avançados (Prophet, XGBoost, LSTM, Autoencoders, DBSCAN, One-Class SVM).

Os modelos avançados são extensão natural: a interface de `ml/` aceita novo algoritmo sem alteração em `api/` ou `etl/`.

---

## Rastreabilidade de requisitos

Os 18 requisitos, com enunciado original, **critério de aceitação verificável**, plano responsável e status, estão em [[Licitações - Requisitos]].

Resumo por plano:

| Plano | Semanas | Requisitos |
|---|---|---|
| 01 - Fundação | 1-2 | RF03, RF10 (parcial), RNF01, RNF04, RNF05, RNF07 |
| 02 - ETL | 3-5 | RF01, RF02, RF03, RF10 |
| 03 - API | 6 | RF04, RF05, RF08, RNF03, RNF06 |
| 04 - Previsão | 7-9 | RF06 |
| 05 - Anomalias | 10-12 | RF07, RNF08 |
| 06 - Dashboard | 13-15 | RF09, RNF06 |
| 07 - Fechamento | 16 | RNF02 |

**RNF07 é atendido apenas parcialmente** - segredos em variáveis de ambiente, mas sem autenticação de usuários, que está fora de escopo. A lacuna está declarada, não omitida.

---

## Divergências em relação ao PDF original

Para atualização do documento de especificação do TCC:

| Item | PDF original | Decisão atual |
|---|---|---|
| Backend da API | FastAPI (Python) | PHP 8.4 / Laravel 13.23 |
| Frontend | React + Vite + Tailwind | Angular 22.1 + Material + ECharts |
| Repositório | Monolito implícito | **Polyrepo**: cinco repositórios independentes |
| Desenvolvimento | Não especificado | **Container-first**: host só precisa de Docker |
| Qualidade | RNF02 genérico | Análise estática no nível máximo das três stacks |
| Processamento | Pandas | Polars, com pandas na fronteira do ML |
| Séries temporais | Statsmodels | statsforecast, com statsmodels em diagnóstico |
| Fontes de dados | Múltiplos portais, incl. estaduais e municipais | Federal, via Portal da Transparência; PNCP como bônus |
| Escopo temporal | Não especificado | 201301-202404 |
| Camada intermediária | Não prevista | Arquitetura medalhão com Parquet |
| Segurança | RNF07 genérico | Atendimento parcial declarado |
