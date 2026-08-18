---
title: "Licitações - Modelos Preditivos e Anomalias"
type: note
tags: [tcc, licitacoes, ia, machine-learning, series-temporais, estatistica]
created: "2026-08-02"
status: ready
---

Módulos de IA do [[TCC - Sistema Inteligente para Licitações]]. Dois módulos independentes, ambos executados em lote e materializando resultados em tabelas - ver [[Licitações - Modelo de Dados]].

## Módulo de previsão

**Entrada:** `serie_mensal`, agregada por órgão e por modalidade.
**Alvos:** quantidade de licitações e valor total.
**Modelo:** SARIMA com componente sazonal de período 12.

**Motor: `statsforecast`.** Treinar por órgão significa centenas de séries independentes; o AutoARIMA compilado com Numba resolve isso em ordem de grandeza menor de tempo que o ajuste sequencial interpretado. O `statsmodels` permanece com papel restrito: gerar o sumário estatístico e os testes de resíduo do modelo final, conteúdo relevante para a monografia. Como a previsão é univariada, não há variáveis exógenas e os dois produzem resultado equivalente.

### Avaliação - backtesting com janela deslizante

Divisão aleatória treino/teste é **inadmissível** em séries temporais porque vaza informação futura para o passado. O protocolo é: treinar até a competência *t*, prever *t+1..t+h*, avançar a janela, repetir.

**Métricas:** MAE, RMSE e MAPE, sempre **em comparação com baseline sazonal ingênuo** - a previsão para o mês *m* é o valor do mês *m* do ano anterior.

Sem esse baseline, uma métrica de erro isolada não sustenta afirmação de valor. É a primeira pergunta que uma banca competente faz.

---

## Módulo de detecção de anomalias

**Modelo inicial:** `IsolationForest`. **Método de contraste:** `LocalOutlierFactor`. Ambos no scikit-learn - sem necessidade de dependência adicional.

### Atributos

| Atributo | Origem | Fundamento |
|---|---|---|
| Razão entre valor e mediana histórica do mesmo órgão e modalidade | `licitacao` | Desvio contextualizado, não absoluto |
| **Número de participantes na licitação** | `participante_licitacao` | Participante único indica baixa competitividade |
| **Taxa de vitória do fornecedor naquele órgão** | `participante_licitacao` | Captura relação recorrente entre contratante e contratado |
| **Concentração de vencedores por órgão (HHI)** | `participante_licitacao` | Competitividade estrutural do órgão |
| Razão entre valor unitário e mediana do mesmo código de item no período | `item_licitacao` | Comparação item a item entre órgãos |
| Intervalo entre `data_abertura` e `data_resultado` | `licitacao` | Prazos atípicos |
| Desvio sazonal em relação ao padrão do órgão | `serie_mensal` | Concentração incomum, p.ex. fim de exercício |

Os três em destaque só são construíveis porque `ParticipantesLicitação.csv` fornece o conjunto de concorrentes com identificação do vencedor. É o que distingue este trabalho de um detector genérico de outlier de valor, e o argumento central da escolha da fonte - ver [[Licitações - Fontes de Dados Públicos]].

Todos são agregações, portanto vetorizáveis em Polars. Nenhum exige laço por registro.

---

## Em aberto - erro de digitação da fonte é anomalia?

**Decidir no Plano 05, antes de treinar o detector.**

Medido na base carregada: **291.430 itens (2,06%) têm `quantidade x valor_item` acima de R$ 1 bilhão**, e 9.221 passam de R$ 1 trilhão. O caso extremo soma R$ 960 sextilhões - mais que o PIB mundial por várias ordens de grandeza.

A origem é rastreável e não é erro de cálculo nosso:

```
UNIMED MISSÕES/RS, competência 202301, 1 item
"ASSISTENCIA MEDICA - HOSPITALAR / DOMICILIAR"
quantidade 2.000.000.000,0000 x valor_item 4.800.000,0000 = R$ 9,6 quatrilhões
```

Dois bilhões de unidades de um convênio médico. O valor total foi lançado no campo de quantidade.

### A tensão

Esses registros **são** estatisticamente atípicos, então um Isolation Forest vai colocá-los no topo do ranking - e estará certo, pelo critério que lhe demos. Mas o que o trabalho se propõe a sinalizar é **padrão atípico de contratação**, não **erro de preenchimento**.

Se o detector entrega uma lista dominada por erro de digitação, ele funciona e não serve. E a distinção não pode ser feita depois, olhando o resultado: ela muda o que entra como atributo.

### Caminhos, a decidir com medida

1. **Tratar como classe própria.** Um passo de qualidade antes do detector separa "implausível" de "atípico", e a API expõe os dois. Mais honesto, e vira seção de metodologia - a taxa de 2,06% é resultado.
2. **Winsorizar ou usar log.** Reduz o peso do extremo sem descartar. Preserva a linha, mas dilui um sinal que pode ser legítimo em contrato grande de verdade.
3. **Usar atributos robustos.** Quantidade de itens e de participantes em vez de valor absoluto - o ranking por quantidade já produz resultado plausível hoje, enquanto o ranking por valor não.
4. **Não tratar.** Assumir que erro de preenchimento é um achado válido. Defensável, mas precisa estar declarado - senão a banca lê a lista e conclui que o detector não funciona.

### O que já se sabe

O ranking por **valor** hoje é dominado por esses casos. O mesmo ranking por **quantidade de itens** devolve distribuidores e farmacêuticas com presença consistente - J. J. VITALLI com 70.296 itens em 7.338 licitações, Sigma-Aldrich, Cristália. Perfil plausível de fornecedor recorrente.

Isso é evidência de que a escolha do atributo, e não do algoritmo, decide a qualidade do resultado.

## Avaliação sem rótulos

Não existe conjunto rotulado de "licitações anômalas". Esta é a **principal fragilidade metodológica** do módulo, e é enfrentada explicitamente por três frentes:

1. **Injeção de anomalias sintéticas.** Perturbar registros reais de forma controlada - inflar valor, reduzir participantes a um, concentrar vitórias - e medir precisão e recall na recuperação desses casos. Produz números objetivos.
2. **Concordância entre métodos independentes.** Comparar os conjuntos sinalizados por Isolation Forest e LOF. Alta concordância sugere estrutura real no dado, não artefato de um algoritmo.
3. **Análise qualitativa dos 20 primeiros.** Inspeção caso a caso, com justificativa escrita do que torna cada registro atípico. Frágil isoladamente, valiosa como triangulação e como conteúdo de discussão.

A ausência de rótulos deve ser **declarada como limitação** no texto, não contornada silenciosamente.

---

## Restrição de produto - atipicidade não é fraude

O documento original estabelece que o sistema não caracteriza fraude. Isso é implementado como comportamento observável, não apenas como texto na monografia:

- A API expõe o campo como `score` e `posicao_ranking`, jamais como `suspeita`, `irregularidade` ou equivalente
- O dashboard exibe aviso permanente na tela de anomalias: **atipicidade estatística não constitui indício de irregularidade**
- A resposta de `/anomalies/{id}` inclui a contribuição dos atributos, de modo que o sinal seja interpretável e contestável

---

## Extensões previstas

A interface de `ml/` aceita novo algoritmo sem alteração em `api/` ou `etl/` - satisfaz o RNF08. Candidatos fora do escopo deste ciclo: Prophet, XGBoost e LSTM na previsão; DBSCAN, Autoencoders e One-Class SVM nas anomalias; SHAP para explicabilidade formal.
