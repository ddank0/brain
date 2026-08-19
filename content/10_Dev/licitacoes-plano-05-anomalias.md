---
title: "Licitações - Plano 05 - Anomalias"
type: note
tags: [tcc, licitacoes, plano, ml, anomalias, isolation-forest]
created: "2026-08-19"
status: ready
---

**Objetivo:** atribuir a cada licitação um score de atipicidade interpretável, com a contribuição dos atributos exposta pela API, e avaliar o detector em três frentes apesar da ausência de rótulos.

**Arquitetura:** núcleo puro em `ml/features.py` e `ml/anomaly.py`; a casca em `ml/runner.py` lê do silver e do banco, chama o núcleo e grava `score_anomalia`. Nenhum modelo roda por HTTP.

**Stack:** scikit-learn (IsolationForest e LocalOutlierFactor), Polars.

**Cobre:** semanas 10-12. RF07 e RNF08.

Contexto em [[Licitações - Modelos Preditivos e Anomalias]]. **É a contribuição central do trabalho e não se corta** - a ordem de corte está na nota do projeto.

---

## Restrições globais

- **Identidade git:** `Gabriel Miranda <isporck0@gmail.com>`. Commits em português, `tipo(escopo): descrição`. Commit só quando pedido.
- **Vocabulário inviolável:** score e posição de ranking. Nunca `suspeita`, `irregularidade`, `fraude` ou equivalente - nem em nome de campo, nem em label, nem em comentário. O teste de vocabulário da API já varre isso; o código novo também não pode conter.
- **Nenhum módulo do núcleo importa `db/` ou `portal/`**; cada módulo novo entra no `.importlinter` na mesma tarefa (o teste de contratos falha se esquecer).
- **`data_abertura` não entra em feature nenhuma:** 72,6% nula.
- **Para competitividade, a fonte de verdade é `participante.flag_vencedor`**, não `item.cnpj_vencedor`.
- Depois de qualquer `tcc train`/`tcc score`, o resumo de avaliação precisa ser repersistido se a rodada for substituída - `execucao_modelo` guarda estado corrente.

## Orçamento desta fase

| Operação | Alvo |
|---|---|
| Construção da matriz de features (a partir do silver) | < 5 min |
| `score` completo (IsolationForest, 1,74M linhas) | < 10 min |
| Avaliação sintética completa | < 30 min |

---

## Verificações feitas antes de escrever este plano

Medidas no silver e na base completa em 2026-08-19.

### Participante único é a NORMA, não o desvio

A nota de modelos dizia "participante único indica baixa competitividade". Medido: **70,3% das licitações têm participante único** - não pode ser sinal de anomalia o que é a maioria. A explicação está na modalidade:

| Modalidade | Licitações | Participante único | Mediana |
|---|---|---|---|
| Dispensa de Licitação | ~1,1M | ~98% | 1 |
| Inexigibilidade | 232.051 | 98% | 1 |
| **Pregão - Registro de Preço** | 192.144 | **6%** | 12 |
| **Pregão** | 162.014 | **11%** | 7 |
| Tomada de Preços | 7.044 | 98% | 1 |

Em Dispensa e Inexigibilidade, um participante é a natureza do rito. **Em Pregão, é a exceção (6-11%)** - aí sim é sinal. Consequência de projeto: as features de competitividade são **contextualizadas pela modalidade** (desvio em relação ao típico daquela modalidade), nunca absolutas. Um detector sem esse contexto marcaria 1,3 milhão de dispensas como anômalas e não veria nada num Pregão de um participante só.

### Outros números que moldam as features

- **0,7% das licitações com participantes não têm vencedor marcado** (11.473) - vira feature, não erro: certame fracassado/deserto é atípico por si.
- **3,6% têm valor zero** (63.347). Zero não entra em razão; tratamento explícito.
- **34% dos grupos (órgão, modalidade) têm menos de 30 licitações** para mediana histórica - mas cobrem só 4.213 licitações (0,2%). A mediana contextual usa fallback para a mediana da modalidade quando o grupo é pequeno.
- Agregar os 74,8M de participantes pelo silver custa **12,9s** - a matriz inteira cabe no orçamento.

### Custo dos modelos, medido

| Modelo | Escopo | Custo |
|---|---|---|
| IsolationForest (100 árvores) | 1,74M x 8 completo | **7s** |
| LocalOutlierFactor | amostra de 200k | 31s |

O IsolationForest roda no universo inteiro. O **LOF é O(n²) na prática e roda como contraste numa amostra estratificada** - decisão declarada, não silenciosa.

### A decisão pendente (tcc-jobs#21) precisa ser a primeira tarefa

2,06% dos itens têm `quantidade x valor_item` acima de R$ 1 bilhão; o extremo soma R$ 9,6 quatrilhões num único item. **São erro de preenchimento da fonte, não contratação atípica** - e um detector treinado com eles no espaço de features aponta digitação, não padrão. A decisão (tomada na Tarefa 1): separar **implausível** de **atípico** como classes distintas, com o corte declarado e contado.

### Estado de partida

`score_anomalia` existe desde o Plano 01 (score, posicao_ranking, features_json). `ml/features.py` e `ml/anomaly.py` não existem. scikit-learn não está no projeto. Os endpoints `/anomalies` e `/anomalies/{id}` estão prometidos na tabela da API.

---

## Tarefa 1: Porta de plausibilidade

**Fecha a decisão de tcc-jobs#21.** Separar implausível de atípico ANTES do detector: a distinção muda o que entra como atributo, então não pode ser feita depois olhando o resultado.

**Interface (núcleo):** `marcar_plausibilidade(lf: pl.LazyFrame) -> pl.LazyFrame` - adiciona a coluna `plausivel: bool` aos itens, com o critério declarado em constante.

- [ ] **Passo 1: Testes.** Item com produto acima do corte é marcado; o corte é por item, não por licitação; a contagem de marcados sai junto; item normal passa intacto.
- [ ] **Passo 2: Implementar.** Corte inicial: produto > R$ 1 bilhão por item (2,06% medidos). A constante documenta a origem do número.
- [ ] **Passo 3: Medir no silver** quantos itens e licitações são afetados, registrar.
- [ ] **Passo 4:** as features da Tarefa 2 usam **apenas itens plausíveis** para valores; a licitação que contém item implausível ganha a flag `contem_item_implausivel` - vira atributo booleano, não descarte.
- [ ] **Passo 5:** commit e fechar tcc-jobs#21 com a decisão registrada.

---

## Tarefa 2: Matriz de features

**Interface (núcleo):** `montar_features(licitacoes, itens, participantes, serie) -> pl.LazyFrame`, uma linha por licitação.

Atributos, revisados pelos números acima:

| # | Atributo | Correção sobre o plano original |
|---|---|---|
| 1 | Razão valor / mediana do grupo (órgão, modalidade), com fallback para a modalidade | fallback novo, 34% dos grupos são pequenos |
| 2 | Nº de participantes **relativo à mediana da modalidade** | contextualizado: único só é sinal em Pregão |
| 3 | Taxa de vitória do fornecedor vencedor naquele órgão | mantido |
| 4 | HHI de vencedores do órgão na janela | mantido |
| 5 | Razão valor unitário do item / mediana do mesmo `codigo_item_compra` | só itens plausíveis; sentinelas fora |
| 6 | ~~Intervalo abertura-resultado~~ | **REMOVIDO: 72,6% de `data_abertura` nula** |
| 7 | Desvio da competência vs padrão sazonal do órgão | mantido |
| 8 | `sem_vencedor` (0,7%) e `contem_item_implausivel` (T1) | novos, booleanos |

- [ ] **Passo 1: Testes de contrato** - colunas, tipos, faixas (razões > 0, HHI em [0,1]), ausência de nulos inesperados, e os casos degenerados: licitação sem participante (2%), sem item (1,78%), valor zero (3,6%).
- [ ] **Passo 2: Implementar puro**, LazyFrame de ponta a ponta, collect na casca.
- [ ] **Passo 3: Validar contra o dado real** - distribuições de cada feature registradas; nenhuma constante, nenhuma explosão de nulos.
- [ ] **Passo 4:** registrar módulo no `.importlinter`; commit.

---

## Tarefa 3: Envelope do IsolationForest

**Interface (núcleo):** `pontuar(matriz, seed=42) -> Scores` - aqui a seed é real: o IsolationForest sorteia subamostras.

- [ ] **Passo 1: Testes de protocolo.** Determinismo com a mesma seed; score maior = mais atípico (orientação documentada - o sklearn devolve invertido); tamanho da saída; matriz com uma linha só não estoura; NaN é recusado com mensagem clara.
- [ ] **Passo 2: Implementar**, com normalização das features embutida (robusta: mediana/IQR, não média/desvio - as caudas são pesadas).
- [ ] **Passo 3:** commit. A fronteira é o RNF08: trocar o algoritmo muda este módulo, nunca `api/` ou `etl/`.

---

## Tarefa 4: Contribuição dos atributos

O `/anomalies/{id}` promete contribuição por atributo - é o que torna o score **contestável**, e contestabilidade é requisito de produto.

- [ ] **Passo 1:** implementar contribuição por desvio normalizado: para cada licitação, o z-score robusto de cada feature em relação à população, ordenado. Não é SHAP (fora de escopo declarado) - é a explicação de "o que está longe do típico neste registro", e o método fica documentado na API.
- [ ] **Passo 2: Testes**: soma e ordenação coerentes; feature no típico contribui ~0; o vocabulário das chaves não contém termo proibido.
- [ ] **Passo 3:** commit.

---

## Tarefa 5: Casca do score e CLI

- [ ] **Passo 1: Testes da casca** com banco semeado: `score_anomalia` populada com score, ranking e `features_json`; reprocessar substitui; `execucao_modelo` registra parâmetros e seed.
- [ ] **Passo 2: Implementar** `tcc score`: monta a matriz do silver + banco, pontua, grava. `posicao_ranking` denso por score decrescente.
- [ ] **Passo 3: Rodar na base completa e medir** contra o orçamento de 10 min.
- [ ] **Passo 4:** commit.

---

## Tarefa 6: Avaliação sem rótulos - as três frentes

**A contribuição central.** Cada frente produz número registrado, qualquer que seja.

- [ ] **Frente 1: Injeção sintética.** Perturbar ~1.000 licitações reais de forma controlada (inflar valor 10-100x dentro do plausível, reduzir participantes de um Pregão a 1, concentrar vitórias), re-pontuar e medir precision@k e recall na recuperação. O gerador de perturbações é testado; a semente é fixa.
- [ ] **Frente 2: Concordância IsolationForest vs LOF.** LOF numa amostra estratificada de 200k (custo medido: 31s); overlap dos top-1% pelos dois métodos, com o Jaccard registrado.
- [ ] **Frente 3: Análise qualitativa dos top-20.** Caso a caso, com a contribuição dos atributos como guia e justificativa escrita. Inclui verificar quantos dos top-20 são erro de digitação que escapou da porta de plausibilidade - esse número mede a própria porta.
- [ ] Registrar os três resultados na nota de modelos, com data e limitações.

---

## Tarefa 7: Endpoints `/anomalies` e `/anomalies/{id}`

**Repositório: tcc-api.** Mesmo padrão do Plano 03: FormRequest com lista branca, tipos como string para decimais, OpenAPI anotado, testes de contrato.

- [ ] `/anomalies`: ranking paginado com filtros de competência e órgão; expõe score, posição e a licitação resumida. Lê `score_anomalia` - nada de calcular no request.
- [ ] `/anomalies/{id}`: score + contribuição dos atributos (do `features_json`) + os dados da licitação. 404 para id sem score.
- [ ] O aviso de não-fraude entra no `meta` de ambos - o texto é fixo e testado, para a tela do Plano 06 apenas exibir.
- [ ] Teste de vocabulário estendido aos dois endpoints; `openapi:export`; p95 medido (alvo: 300 ms).

---

## Tarefa 8: Revisão com mutação e dados persistidos

O padrão que os planos anteriores estabeleceram: teste verde prova o código; o dado persistido precisa de conferência própria.

- [ ] Mutações nos pontos críticos (orientação do score, normalização, porta de plausibilidade, contribuição) - cada uma precisa quebrar a suíte.
- [ ] Conferir `score_anomalia` persistido: ranking denso sem buraco, scores finitos, top-20 inspecionado.
- [ ] Recomputar por caminho independente os números publicados da avaliação.

---

## Critério de conclusão

- [ ] Porta de plausibilidade decidida, medida e aplicada (fecha tcc-jobs#21)
- [ ] Features contextualizadas por modalidade, sem `data_abertura`, validadas contra o dado real
- [ ] `score_anomalia` populada para as 1,74M licitações dentro do orçamento
- [ ] Determinismo com seed fixa (aqui há sorteio de verdade)
- [ ] As três frentes de avaliação com números registrados
- [ ] `/anomalies` e `/anomalies/{id}` no ar, com contribuição e aviso de não-fraude
- [ ] Teste de vocabulário cobrindo os endpoints novos
- [ ] Nenhum termo proibido em código, campo, chave de JSON ou comentário
- [ ] `make check` verde nos repositórios tocados; CI verde; `git status` limpo

## Próximo plano

Com scores e previsões servidos pela API, segue o **Plano 06 - Dashboard** (semanas 13-15): as cinco telas em Angular com o cliente gerado do OpenAPI. A tela de anomalias exibe o aviso permanente que a API já fornece.
