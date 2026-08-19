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
| **Número de participantes, relativo à mediana da modalidade** | `participante_licitacao` | **Medido: 70,3% das licitações têm participante único** - é a natureza de Dispensa e Inexigibilidade (98%), mas exceção em Pregão (6-11%). Sem o contexto da modalidade, o sinal aponta o rito, não o desvio |
| **Taxa de vitória do fornecedor naquele órgão** | `participante_licitacao` | Captura relação recorrente entre contratante e contratado |
| **Concentração de vencedores por órgão (HHI)** | `participante_licitacao` | Competitividade estrutural do órgão |
| Razão entre valor unitário e mediana do mesmo código de item no período | `item_licitacao` | Comparação item a item entre órgãos |
| ~~Intervalo entre `data_abertura` e `data_resultado`~~ | `licitacao` | **Removido: 72,6% das `data_abertura` são nulas** - a feature existiria para um quarto da base |
| Desvio sazonal em relação ao padrão do órgão | `serie_mensal` | Concentração incomum, p.ex. fim de exercício |

Os três em destaque só são construíveis porque `ParticipantesLicitação.csv` fornece o conjunto de concorrentes com identificação do vencedor. É o que distingue este trabalho de um detector genérico de outlier de valor, e o argumento central da escolha da fonte - ver [[Licitações - Fontes de Dados Públicos]].

Todos são agregações, portanto vetorizáveis em Polars. Nenhum exige laço por registro.

---

## Resultado do backtesting - SARIMA vs baseline (2026-08-19)

23.730 avaliações: 1.459 séries por órgão e modalidade, 9 janelas expansivas de 12 meses ancoradas pelo fim, dois alvos. Protocolo com não-vazamento provado por teste e por mutação. Custo: 40,2 min, dentro do orçamento de 45.

### Veredito, em três camadas

| Recorte | Quantidade | Valor |
|---|---|---|
| MASE mediano (todas as séries) | **0,979** | 1,000 |
| Vitórias do SARIMA | 52,8% | 48,1% |
| MASE mediano no top-10% das séries por volume de erro | **0,967** | **0,879** |
| Vitórias no top-10% | 56% | **67%** |
| MAE agregado (SARIMA vs baseline) | 5,2 vs 5,2 | **38,8M vs 74,2M** |
| RMSE agregado | **6,5 vs 6,9** | **126,5M vs 249,3M** |
| MAPE mediano | **67,9% vs 81,9%** | 505,6% vs **236,5%** |

A leitura honesta: **na mediana o SARIMA empata com o baseline; nas séries grandes, vence com folga.** Para o alvo de valor, o erro absoluto agregado do SARIMA é quase metade do baseline - mas a mediana é empate, porque a maioria das 1.459 séries é pequena e quase constante, onde não há o que um modelo aprenda sobre a repetição ingênua.

O MASE **médio** de valor é 153,7 e não deve ser usado: é razão entre erros, e explode quando o baseline acerta quase exato numa série minúscula. A mediana e a contagem de vitórias são as medidas estáveis - e o relatório traz as duas justamente porque a média esconde a cauda.

O MAPE de valor conta a mesma história pelo avesso, e vale deixar explícito: **em termos percentuais o SARIMA é bem pior na mediana (505,6% contra 236,5%)**, ao mesmo tempo em que o erro absoluto cai à metade. Não é contradição - o SARIMA suaviza em direção à média da série, o que erra por muito, percentualmente, nos meses pequenos das séries pequenas, e acerta onde o dinheiro está. Qual métrica importa depende do uso: para somar orçamento, o absoluto; para acompanhar uma série pequena específica, o baseline ingênuo é páreo duro.

### A medição preliminar não se confirmou - e o porquê importa

O teste rápido feito ao escrever o plano (15 séries de maior volume, uma única janela) apontava o SARIMA perdendo por 19%. No protocolo completo, o top-10% das séries dá MASE 0,879-0,967 a favor do SARIMA. A diferença é o protocolo: uma janela única termina exatamente na queda de regime de 2024, e nove janelas distribuem a avaliação pela história. **Conclusão metodológica: avaliação de série temporal com janela única é ruído com cara de resultado.**

### As três hipóteses, respondidas

**1. Quebra estrutural de 2021 não derruba o SARIMA relativo ao baseline.** O MASE mediano por janela (quantidade) até melhora nas janelas recentes: 1,000 nas duas primeiras (2015-16, treino curto), 0,94-0,98 de 2017 em diante, com vitórias subindo de 39% para 54-58%. A queda de regime atinge os dois modelos por igual - a medida relativa fica estável.

**2. As competências parciais não contaminam a comparação.** A última janela, que contém 202404 truncada, tem MASE mediano 0,949 contra 0,982 das demais (quantidade) - ligeiramente melhor, não pior. O corte da fonte prejudica os dois modelos na mesma proporção.

**3. Quantidade é mais previsível que valor na mediana; valor é onde o SARIMA mais agrega nas séries grandes.** Coerente com a natureza do dado: o valor mensal é dominado por poucos contratos grandes, e é aí que a estrutura temporal ajuda mais que a repetição do ano anterior.

### Pós-processamento das previsões servidas

As previsões persistidas em `previsao` são truncadas em zero, nos três limites: o domínio é contagem e valor, e o ARIMA irrestrito extrapolou queda para baixo de zero em 512 das 3.492 previsões de quantidade da primeira rodada. Quando a previsão inteira é negativa, o intervalo degenera para [0, 0] - a leitura honesta de "essencialmente zero".

**O backtesting foi medido sem o truncamento**, direto da saída do modelo. Isso é conservador para o SARIMA: truncar em zero só reduziria o erro dele (o observado nunca é negativo), então o empate na mediana é um piso, não um teto.

### Acoplamento operacional: retreinar apaga as métricas do backtest

`execucao_modelo` guarda estado corrente por desenho - o retreino substitui a
rodada do mesmo agrupamento, e as métricas de backtest gravadas no
`metricas_json` vão junto. **Depois de qualquer `tcc train`, o resumo do
backtest precisa ser repersistido.** Descoberto na revisão do plano: a
verificação final encontrou zero execuções com backtest, minutos depois de
elas terem sido gravadas.

### Limitações declaradas

- **21,9% das avaliações têm MASE indefinido**: o baseline foi perfeito na janela, quase sempre em séries constantes ou zeradas. Ficam fora da comparação - incluí-las como vitória de qualquer lado seria inventar resultado.
- As 55 séries com menos de 36 meses de calendário ficaram fora: **297 licitações, 0,017% do volume**. (Uma versão anterior desta nota dizia 0,4% - era o número de antes do preenchimento de calendário, quando o corte era por contagem de linhas.)
- O experimento avalia previsão um-ano-à-frente com re-treino anual; horizontes menores com re-treino mensal não foram medidos.

## Resultado da avaliação de anomalias (2026-08-19)

Detector: IsolationForest (100 árvores, seed 42) sobre oito atributos contextualizados, normalização robusta por mediana/IQR. Universo: 1.743.023 licitações, pontuadas em 6,2 min.

### Frente 1 - injeção sintética

1.000 licitações perturbadas de forma multiplicativa e reproduzível (seed fixa), re-pontuadas junto com o universo:

| Corte | Recuperadas | Recall |
|---|---|---|
| top-1.000 | 16 | 1,6% |
| top-1% (17.430) | 133 | **13,3%** |
| top-5% (87.151) | 328 | 32,8% |

O recall é baixo, e a causa é estrutural e medida: **a cauda natural da base é mais extrema que qualquer planta plausível** - há ~17 mil linhas reais com razão de valor acima de 310x, então perturbações de 10-100x não alcançam o top-1%. O experimento mede menos o detector e mais a natureza da base: o extremo real é dominado por registros da classe qualidade-de-dado.

O desenho do experimento também precisou de uma iteração, registrada porque é achado: a primeira versão plantava alvos absolutos (taxa de vitória 1,0, HHI alto), e isso é o TÍPICO desta base - a mediana real de taxa de vitória é 1,0, consequência dos 70,3% de participante único. Plantar o típico e cobrar recuperação mede o gerador, não o detector.

### Frente 2 - concordância entre métodos

IsolationForest vs LocalOutlierFactor, amostra estratificada de 200 mil:

| Medida | Valor |
|---|---|
| Jaccard dos top-1% | **0,049** |
| Spearman dos scores | 0,242 |

Concordância baixa, com causa conhecida e declarada: **70% das linhas têm features idênticas** (dispensas de participante único com razões neutras), e métodos de densidade como o LOF degeneram com empates massivos - o próprio scikit-learn emite o aviso. A concordância baixa aqui não arbitra qual método está certo; diz que o dado tem uma estrutura (duplicação massiva do caso típico) com a qual o LOF não lida.

### Frente 3 - qualitativa do top-20, e o artefato que ela encontrou

A primeira rodada tinha as 20 posições do topo ocupadas por licitações sigilosas da Polícia Federal, com HHI 0,976. A inspeção revelou artefato: o CNPJ sentinela `-11` ("Sigiloso") era contado como vencedor recorrente, e a concentração era de representação, não de comportamento. **As features de identidade (taxa de vitória, HHI) passaram a excluir sentinelas** - como o ranking de fornecedores já fazia - e o recall sintético dobrou como efeito colateral.

Após a correção, o top-20 é 100% da classe `contem_item_implausivel`, dominado por `razao_valor_grupo` entre 1.100x e 67.000x: **a cabeça do ranking é qualidade de dado**, não padrão de contratação. Isso é informação, não fracasso - a flag booleana exposta pela API permite à tela segmentar as duas classes, e a contribuição por atributo diz em cada caso o porquê da posição.

### Limitações declaradas

- Não existe rótulo; as três frentes são triangulação, não validação. Declarado no texto.
- O recall sintético usa plantas plausíveis por construção - plantas mais extremas seriam recuperadas trivialmente e inflariam o número.
- O LOF é inadequado à estrutura desta base (empates massivos); serve como contraste declarado, não como segundo veredito.
- A porta de plausibilidade é absoluta (R$ 1 bi/item); erros de digitação relativos (item a 145.000x a mediana do código, abaixo do corte absoluto) permanecem no universo e dominam o topo. Porta relativa fica como trabalho futuro.

## Decidido - erro de digitação da fonte NÃO é anomalia de contratação

**Decidido e implementado na T1 do Plano 05:** implausível e atípico são classes distintas. O corte (R$ 1 bi por item, declarado em `CORTE_PLAUSIBILIDADE`) marca 291.430 itens; a licitação afetada ganha a flag `contem_item_implausivel` como atributo em vez de descarte.

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
