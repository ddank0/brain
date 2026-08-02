---
title: "TCC - Sistema Inteligente para Licitações"
type: project
tags: [tcc, licitacoes, dados, ia]
created: "2026-08-02"
status: active
goal: "Coletar licitações públicas federais, prever tendências por séries temporais e sinalizar registros atípicos, expondo tudo via API e dashboard"
stack: [python, polars, postgresql, php, laravel, angular, docker]
---

Trabalho de Conclusão de Curso. Sistema que coleta dados públicos de licitações federais, organiza em base estruturada, produz previsões por séries temporais e sinaliza registros estatisticamente atípicos.

O sistema é **analítico e preditivo**. Não substitui auditoria nem caracteriza fraude - identifica registros que se afastam do padrão histórico e merecem análise humana. Ver [[Licitações - Modelos Preditivos e Anomalias]].

---

## Notas do projeto

| Nota | Conteúdo |
|------|----------|
| [[Licitações - Fontes de Dados Públicos]] | Investigação do PNCP e Portal da Transparência, com evidências |
| [[Licitações - Arquitetura do Sistema]] | Divisão poliglota, contratos entre camadas, alternativas descartadas |
| [[Licitações - Modelo de Dados]] | Dimensões, fatos, chave natural, índices |
| [[Licitações - Pipeline de Dados]] | Medalhão, os cinco jobs, armadilhas do formato |
| [[Licitações - Modelos Preditivos e Anomalias]] | SARIMA, Isolation Forest, avaliação sem rótulos |

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
2. Base carregada com o histórico completo disponível (~135 meses).
3. Previsões com erro medido **contra baseline**, não em termos absolutos.
4. Detector de anomalias com avaliação defensável apesar da ausência de rótulos.
5. Resultados navegáveis por não-programador.
6. Cada camada substituível sem reescrita das demais.

---

## Cronograma

| Semanas | Entrega | Requisitos |
|---|---|---|
| 1-2 | Docker Compose, PostgreSQL, Alembic, esqueleto das três stacks | RNF01, RNF04, RNF05 |
| 3-5 | ETL em Python: download, parse, `COPY`, medalhão; carga de 201301-202404 | RF01, RF02, RF03, RF10 |
| 6 | API em Laravel: consulta e análise histórica; exportação do OpenAPI | RF04, RF05, RF08, RNF03 |
| 7-9 | SARIMA, backtesting, baseline, seleção de parâmetros | RF06 |
| 10-12 | Features, Isolation Forest, LOF, avaliação em três frentes | RF07 |
| 13-15 | Dashboard Angular, cinco telas | RF09 |
| 16 | Testes finais, README, redação | RNF02 |
| **Bônus** | Conector PNCP, se houver tempo residual | - |

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
| Carga de 21,8M linhas excede o orçamento | Média | Médio | `COPY` em vez de ORM; carga por competência; índices desde a primeira migration |
| SARIMA não supera o baseline | Média | Médio | Resultado negativo é resultado válido; a comparação é a contribuição |
| Anomalias sem validação convincente | Média | Alto | Três frentes de avaliação; limitação declarada |
| Estouro de prazo | Média | Alto | Ordem de corte pré-definida |

---

## Fora de escopo

Alinhado às evoluções futuras do documento original: ingestão em tempo real, autenticação e perfis, alertas por e-mail, mapas geográficos, XAI/SHAP formal, treinamento contínuo, microsserviços, processamento distribuído, e modelos avançados (Prophet, XGBoost, LSTM, Autoencoders, DBSCAN, One-Class SVM).

Os modelos avançados são extensão natural: a interface de `ml/` aceita novo algoritmo sem alteração em `api/` ou `etl/`.

---

## Rastreabilidade de requisitos

| Requisito | Onde é atendido |
|---|---|
| RF01 Importar dados públicos | [[Licitações - Pipeline de Dados]] - `ingest` |
| RF02 Normalizar informações | [[Licitações - Pipeline de Dados]] - camada silver |
| RF03 Armazenar no banco | [[Licitações - Modelo de Dados]] |
| RF04 Consultar licitações | [[Licitações - Arquitetura do Sistema]] - `/licitacoes` |
| RF05 Análises históricas | [[Licitações - Arquitetura do Sistema]] - `/analytics/*` |
| RF06 Gerar previsões | [[Licitações - Modelos Preditivos e Anomalias]] |
| RF07 Detectar anomalias | [[Licitações - Modelos Preditivos e Anomalias]] |
| RF08 API REST | [[Licitações - Arquitetura do Sistema]] |
| RF09 Dashboard interativo | Escopo do dashboard, acima |
| RF10 Logs de processamento | [[Licitações - Modelo de Dados]] - `ingestao_log` |
| RNF01 Arquitetura modular | [[Licitações - Arquitetura do Sistema]] |
| RNF02 Manutenibilidade | [[Licitações - Arquitetura do Sistema]] |
| RNF03 API documentada | OpenAPI versionado |
| RNF04 Migrations | Alembic |
| RNF05 Containerização | Docker Compose |
| RNF06 Tempo de resposta | Resultados materializados; orçamento de desempenho |
| RNF07 Segurança de acesso | **Parcial** - segredos em variáveis de ambiente. Autenticação de usuários está fora de escopo |
| RNF08 Extensibilidade de modelos | Interface de `ml/` |

**Sobre o RNF07:** o documento original menciona "segurança no acesso à aplicação". Como autenticação de usuários está fora de escopo, o requisito é atendido apenas parcialmente. A lacuna é registrada para decisão consciente, não omitida.

---

## Divergências em relação ao PDF original

Para atualização do documento de especificação do TCC:

| Item | PDF original | Decisão atual |
|---|---|---|
| Backend da API | FastAPI (Python) | PHP 8.3 / Laravel |
| Frontend | React + Vite + Tailwind | Angular + Material + ECharts |
| Processamento | Pandas | Polars, com pandas na fronteira do ML |
| Séries temporais | Statsmodels | statsforecast, com statsmodels em diagnóstico |
| Fontes de dados | Múltiplos portais, incl. estaduais e municipais | Federal, via Portal da Transparência; PNCP como bônus |
| Escopo temporal | Não especificado | 201301-202404 |
| Camada intermediária | Não prevista | Arquitetura medalhão com Parquet |
| Segurança | RNF07 genérico | Atendimento parcial declarado |
