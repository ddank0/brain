---
title: "Licitações - Plano 04 - Previsão"
type: note
tags: [tcc, licitacoes, plano, ml, sarima, backtesting]
created: "2026-08-18"
status: ready
---

**Objetivo:** prever quantidade e valor de licitações por órgão e modalidade, com erro medido **contra um baseline**, e provar por teste que o protocolo de avaliação não vaza informação do futuro.

**Arquitetura:** núcleo puro em `ml/forecast.py` e `ml/evaluation.py` - recebem dados, devolvem dados. A casca (`ml/runner.py`) lê `serie_mensal`, chama o núcleo e grava `previsao` e `execucao_modelo`. Nenhum treino é acionado por HTTP.

**Stack:** statsforecast (AutoARIMA compilado com Numba), Polars, statsmodels apenas no diagnóstico de resíduos.

**Cobre:** semanas 7-9. RF06.

Contexto em [[Licitações - Modelos Preditivos e Anomalias]].

---

## Restrições globais

- **Identidade git:** `Gabriel Miranda <isporck0@gmail.com>`.
- **Commits em português**, formato `tipo(escopo): descrição`. Commit só quando pedido.
- **Não se testa acurácia; testa-se protocolo.** "O modelo é bom" é resultado experimental, não asserção de teste.
- **Determinismo:** mesma entrada e mesma seed produzem o mesmo resultado, e isso é verificado.
- **Nenhum módulo do núcleo importa `db/` ou `portal/`**, e cada módulo novo entra no `.importlinter` na mesma tarefa que o cria.
- `ml/` não importa `etl/`: comunicam-se por tabelas.

## Orçamento desta fase

| Operação | Alvo |
|---|---|
| `train` de todas as séries elegíveis | < 30 min |
| Backtesting completo | < 45 min |

---

## Verificações feitas antes de escrever este plano

Rodadas contra `serie_mensal`, com as 136 competências carregadas.

### O universo é menor do que parece

`serie_mensal` tem 93.391 linhas, mas isso são pontos, não séries. Agrupando por `(codigo_orgao, codigo_modalidade)`:

| | Séries | Licitações | % do volume |
|---|---|---|---|
| 60 meses ou mais | **737** | 1.715.015 | **98,4%** |
| 24 a 59 meses | 202 | 21.312 | 1,2% |
| menos de 24 meses | 575 | 6.696 | 0,4% |
| **Total** | **1.514** | 1.743.023 | 100% |

**737 séries concentram 98,4% do volume.** Treinar as 1.514 é possível, mas as 575 curtas somam 0,4% e não têm dois ciclos sazonais completos - SARIMA sazonal sobre 18 meses não tem o que estimar.

### A sazonalidade existe e é forte

Média de licitações por mês do ano, na série agregada:

| Mês | Média | | Mês | Média |
|---|---|---|---|---|
| Janeiro | 5.187 | | Julho | 14.186 |
| Fevereiro | 7.552 | | Agosto | 14.710 |
| Março | 10.372 | | Setembro | 14.578 |
| Abril | 10.567 | | Outubro | 17.128 |
| Maio | 13.404 | | **Novembro** | **19.908** |
| Junho | 13.072 | | Dezembro | 14.730 |

Novembro é **3,8x janeiro**. O padrão é o ciclo orçamentário - empenha-se antes do fim do exercício -, cresce ao longo do ano e cai em dezembro. Sazonalidade anual (`m=12`) é a escolha certa, e não uma suposição.

### O custo de treino cabe no orçamento

AutoARIMA com `season_length=12`, um núcleo: **1,2 a 1,9 s por série**. Para as 737 elegíveis, **15 a 24 minutos** sem paralelismo. O alvo é 30 min.

### O SARIMA pode não vencer o baseline - e há evidência preliminar de que não vence

Teste rápido em 15 séries de maior volume, prevendo 12 meses à frente contra baseline sazonal ingênuo (o valor do mesmo mês do ano anterior):

| Recorte | SARIMA vence | MAE médio baseline | MAE médio SARIMA |
|---|---|---|---|
| Com `202404` | 8 de 15 | 124 | **141** |
| Sem `202404` | 6 de 15 | 117 | **164** |

O SARIMA ganha em cerca de metade das séries, **mas perde no erro médio** - quando erra, erra muito mais. Na série de maior volume isoladamente, ficou 19,3% pior que o baseline.

Isto **não é motivo para abandonar o modelo, nem para esconder o número**. É o risco já registrado na nota do projeto: *"SARIMA não supera o baseline - resultado negativo é resultado válido; a comparação é a contribuição"*. O plano existe para medir isso com rigor, não para produzir um vencedor.

O que a medição preliminar deixa como hipóteses a investigar:

1. **Quebra estrutural.** O volume cai de forma contínua e desaba a partir de 2021 com a transição para a Lei 14.133. Um modelo estimado sobre onze anos pode estar aprendendo um regime que acabou.
2. **Competências parciais no teste.** `202404` é truncada e `201812` não tem participantes. Excluir `202404` **piorou** o SARIMA, o que é contraintuitivo e precisa de explicação, não de conveniência.
3. **Alvo errado.** Talvez a quantidade seja mais previsível que o valor, ou vice-versa.

### Estado de partida

`ml/` não existe. `statsforecast` não está instalado. `serie_mensal` está populada e é a única entrada necessária.

---

## Tarefa 1: Dependências e esqueleto de `ml/`

- [ ] **Passo 1:** `uv add statsforecast` e, para diagnóstico, `statsmodels`.
- [ ] **Passo 2:** criar `src/tcc_jobs/ml/__init__.py`, `forecast.py`, `evaluation.py`, `runner.py`.
- [ ] **Passo 3:** registrar os módulos no `.importlinter` - núcleo (`forecast`, `evaluation`) não importa `db/` nem `portal/`; `ml/` não importa `etl/`.
- [ ] **Passo 4:** `uv run lint-imports` e `pytest tests/test_contratos_arquitetura.py` verdes. O teste de contratos falha se um módulo novo ficar fora.
- [ ] **Passo 5:** commit.

---

## Tarefa 2: Baseline sazonal ingênuo

**O baseline é a régua.** Se ele estiver errado, todas as conclusões do trabalho caem - inclusive a de que o SARIMA é melhor ou pior.

**Interface:** `baseline_sazonal(serie: list[float], h: int, m: int = 12) -> list[float]`

- [ ] **Passo 1: Escrever os testes que falham**

```python
def test_repete_o_mesmo_mes_do_ano_anterior() -> None:
    serie = list(range(24))  # 0..23
    assert baseline_sazonal(serie, h=3) == [12.0, 13.0, 14.0]


def test_horizonte_maior_que_o_ciclo_reusa_o_ciclo() -> None:
    """Prever 18 meses com m=12 repete o ciclo, não estoura."""


def test_serie_menor_que_o_ciclo_e_recusada() -> None:
    """Sem um ciclo completo não existe sazonal ingênuo - devolver algo aqui
    seria inventar régua."""


def test_nao_usa_dado_posterior_ao_fim_da_serie() -> None:
    """O baseline olha só para trás. Verificado alterando o futuro e exigindo
    que a previsão não mude."""
```

- [ ] **Passo 2:** rodar e ver falhar.
- [ ] **Passo 3:** implementar. Função pura, sem Polars, sem I/O.
- [ ] **Passo 4:** conferir à mão contra uma série real de `serie_mensal` - o valor previsto para `202401` tem que ser o observado em `202301`.
- [ ] **Passo 5:** commit.

---

## Tarefa 3: Backtesting sem vazamento temporal

**O teste mais importante do projeto.** Um vazamento aqui invalida o trabalho inteiro, é silencioso e não aparece em nenhuma métrica - ao contrário, melhora todas elas.

**Interface:** `janelas(n_pontos: int, h: int, minimo_treino: int) -> Iterator[tuple[slice, slice]]`

- [ ] **Passo 1: Escrever os testes que falham**

```python
def test_nenhuma_janela_de_treino_alcanca_o_futuro() -> None:
    """A asserção central: para toda janela, max(indice de treino) <
    min(indice de teste). Se este teste passar por acidente, o trabalho
    inteiro fica sem fundamento."""
    for treino, teste in janelas(n_pontos=60, h=12, minimo_treino=24):
        assert max(range(60)[treino]) < min(range(60)[teste])


def test_janelas_avancam_e_nao_se_sobrepoem_no_teste() -> None:
    """Teste sobreposto contaria o mesmo erro duas vezes."""


def test_respeita_o_minimo_de_treino() -> None:
    """Menos de dois ciclos não sustenta modelo sazonal."""


def test_serie_curta_demais_nao_gera_janela() -> None:
    """Zero janelas, e não uma janela inválida."""


def test_cobre_o_fim_da_serie() -> None:
    """A última janela precisa alcançar o último ponto - senão o período mais
    recente, que é o que interessa, nunca é avaliado."""
```

- [ ] **Passo 2:** rodar e ver falhar.
- [ ] **Passo 3:** implementar como gerador puro de índices. **Não recebe dados** - só tamanhos. Isso é o que torna o vazamento verificável sem montar série.
- [ ] **Passo 4: Teste de mutação obrigatório**

Alterar o gerador para que uma janela inclua um ponto futuro e **confirmar que a suíte falha**. Se não falhar, o teste não protege nada.

- [ ] **Passo 5:** commit.

---

## Tarefa 4: Métricas de erro

**Interface:** `mae`, `rmse`, `mape`, e `mase` (erro relativo ao baseline).

- [ ] **Passo 1: Testes**

Valores conferidos à mão. Cubra:

- `mape` com observado zero - **acontece no dado real**: há competências com zero licitações para um par órgão/modalidade. Dividir por zero devolve infinito e contamina a média. A decisão (ignorar o ponto, ou usar sMAPE) tem que ser explícita e testada.
- `mase` menor que 1 significa melhor que o baseline; maior que 1, pior. É a métrica que responde à pergunta do trabalho.

- [ ] **Passo 2:** implementar puro.
- [ ] **Passo 3:** commit.

---

## Tarefa 5: Envelope do AutoARIMA

**Interface:** `prever(serie: list[float], h: int, m: int = 12, seed: int = 42) -> Previsao`, devolvendo previsão pontual e intervalo.

- [ ] **Passo 1: Testes de protocolo, não de acurácia**

```python
def test_determinismo() -> None:
    """Mesma entrada e mesma seed, mesmo resultado - duas execuções."""


def test_devolve_o_horizonte_pedido() -> None: ...


def test_intervalo_contem_a_previsao_pontual() -> None:
    """Inferior <= pontual <= superior, ponto a ponto."""


def test_serie_constante_nao_estoura() -> None:
    """Variância zero quebra estimadores. Há séries assim no dado real."""


def test_serie_com_zeros_nao_estoura() -> None: ...
```

- [ ] **Passo 2:** implementar, encapsulando o statsforecast. A fronteira existe para o RNF08: trocar de algoritmo não pode exigir mudança em `api/` nem em `etl/`.
- [ ] **Passo 3:** commit.

---

## Tarefa 6: Seleção de séries elegíveis

- [ ] **Passo 1: Testes**

Elegível é a série com pelo menos `minimo_treino + h` pontos. Medido: 737 séries com 60+ meses cobrem 98,4% do volume; 575 têm menos de 24 meses e não sustentam modelo sazonal.

O critério e o número de séries descartadas entram no resultado - **descartar em silêncio é o que transforma recorte em viés**.

- [ ] **Passo 2:** implementar puro.
- [ ] **Passo 3:** commit.

---

## Tarefa 7: Casca do treino e persistência

**Arquivos:** `ml/runner.py`, e o comando `train` na CLI.

- [ ] **Passo 1: Testes da casca**

Com banco semeado: `execucao_modelo` recebe uma linha por rodada, com parâmetros e métricas; `previsao` recebe as previsões com intervalo; reprocessar não duplica.

- [ ] **Passo 2:** implementar. Ler `serie_mensal` do banco - são 93 mil linhas, e `read_database` dá conta; a regra de ler do silver vale acima de alguns milhões.
- [ ] **Passo 3:** ligar `tcc train --serie orgao` à casca.
- [ ] **Passo 4:** commit.

---

## Tarefa 8: Rodar o backtesting e registrar o resultado

**A contribuição do trabalho está aqui, e o resultado pode ser negativo.**

- [ ] **Passo 1:** rodar o backtesting completo nas séries elegíveis, comparando AutoARIMA contra o baseline sazonal ingênuo.

- [ ] **Passo 2: Registrar honestamente**

| Medida | O que reportar |
|---|---|
| Séries em que o SARIMA vence | Contagem e proporção |
| MAE, RMSE e MAPE médios | Dos dois modelos |
| MASE | A resposta direta: < 1 é melhor que o baseline |
| Distribuição do erro | Média esconde cauda - a preliminar mostrou o SARIMA ganhando em metade das séries e perdendo no agregado |

- [ ] **Passo 3: Investigar as três hipóteses da seção de verificações**

Quebra estrutural de 2021, efeito das competências parciais, e diferença entre prever quantidade e prever valor. Cada uma vira uma medição, não uma opinião.

- [ ] **Passo 4:** registrar os números na nota de modelos, com data. **Se o SARIMA perder, o resultado é esse** - e a comparação com baseline é o que dá valor científico ao achado.

- [ ] **Passo 5:** commit.

---

## Critério de conclusão

- [ ] Teste de vazamento temporal passando, **e verificado por mutação**
- [ ] Baseline sazonal ingênuo conferido à mão contra a série real
- [ ] Determinismo verificado com seed fixa
- [ ] `previsao` e `execucao_modelo` populadas, com reprocessamento idempotente
- [ ] Backtesting completo dentro do orçamento
- [ ] Comparação SARIMA vs baseline registrada com números, **qualquer que seja o vencedor**
- [ ] Séries descartadas contadas e justificadas
- [ ] `make check` verde, contratos de arquitetura íntegros
- [ ] `git status --short` limpo

## Próximo plano

Com a previsão avaliada, segue o **Plano 05 - Anomalias** (semanas 10-12): features, Isolation Forest e avaliação sem rótulos. Há um item aberto que precisa ser decidido antes de treinar - se erro de digitação da fonte conta como anomalia, medido em 2,06% dos itens. Ver [[Licitações - Modelos Preditivos e Anomalias]].
