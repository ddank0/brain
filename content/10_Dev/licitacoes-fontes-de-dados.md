---
title: "Licitações - Fontes de Dados Públicos"
type: note
tags: [tcc, licitacoes, dados, api, etl]
created: "2026-08-02"
status: ready
---

Investigação das fontes públicas de dados de licitações federais para o [[TCC - Sistema Inteligente para Licitações]]. Todas testadas empiricamente em 2026-08-01 - os resultados são reproduzíveis e servem de material para o capítulo de metodologia.

## PNCP - Portal Nacional de Contratações Públicas

Fonte legalmente vigente sob a Lei 14.133/2021, cobrindo União, estados e municípios.

**Verificação:**

- Endpoint: `https://pncp.gov.br/api/consulta/v1/contratacoes/publicacao`
- `codigoModalidadeContratacao` é obrigatório; `tamanhoPagina` mínimo é 10
- Resultado: `HTTP 500 - Erro na comunicação com o banco de dados`, `HTTP 500 - Failed to obtain JDBC Connection`, seguidos de **4 timeouts consecutivos** em janelas de 20s e 45s
- A rede estava íntegra: o Portal da Transparência respondeu em milissegundos nos mesmos testes

**Avaliação:** correta do ponto de vista legal, instável do operacional. Histórico limitado a ~2021 em diante (~60 meses), insuficiente para sustentar sazonalidade anual com folga.

## Portal da Transparência - API REST

- OpenAPI v1.0 em `/v3/api-docs`, com 19 endpoints de licitações e contratos
- Exige chave gratuita, por cadastro de e-mail
- **Limitação estrutural:** `codigoOrgao` é obrigatório em `/api-de-dados/licitacoes` e `/api-de-dados/contratos`. Não dá para varrer por período - seria preciso iterar órgão × período, gerando centenas de requisições sujeitas a limite de taxa

**Avaliação:** boa para consulta pontual, inadequada para carga histórica em massa.

## Portal da Transparência - download em massa

**Fonte escolhida.**

- URL: `https://portaldatransparencia.gov.br/download-de-dados/licitacoes/{AAAAMM}`
- Retorna ZIP com quatro CSVs por competência mensal
- **Janela verificada mês a mês:** de `201301` até `202404`. A partir de `202405`, `403 AccessDenied`. A competência `202404` já vem truncada (832 KB contra ~2,8 MB de um mês típico)

**Causa da descontinuidade:** transição regulatória. A Lei 14.133/2021 encerrou o regime da Lei 8.666/1993 e tornou o PNCP a fonte oficial obrigatória. Os sistemas legados deixaram de alimentar essa base.

### Conteúdo verificado (competência 202401)

| Arquivo | Linhas | Colunas | Conteúdo relevante |
|---|---|---|---|
| `202401_Licitação.csv` | 2.537 | 17 | órgão, órgão superior, UG, modalidade, processo, objeto, situação, UF, município, data abertura, data resultado, valor |
| `202401_ItemLicitação.csv` | 51.808 | 14 | código do item, descrição, quantidade, valor do item, CNPJ e nome do vencedor |
| `202401_ParticipantesLicitação.csv` | 161.400 | 13 | CNPJ e nome de cada participante, flag de vencedor |
| `202401_EmpenhosRelacionados.csv` | 0 | 10 | vazio nesta competência |

**Formato:** `latin-1`, separador `;`, decimal com vírgula (`170612,0000`), datas em `DD/MM/AAAA`.

O arquivo de participantes é o achado mais valioso: ter o conjunto de concorrentes por licitação, com identificação do vencedor, permite atributos de anomalia estruturalmente mais informativos que detecção de outlier de valor. Ver [[Licitações - Modelos Preditivos e Anomalias]].

---

## Decisão: abordagem híbrida

**Fonte primária:** CSVs do Portal da Transparência, `201301`-`202404` (~135 meses).
**Fonte bônus:** conector PNCP, apenas se houver tempo residual.

**Justificativa:**

1. **Extensão da série.** SARIMA com sazonalidade anual requer múltiplos ciclos completos. 135 meses sustentam isso com folga; ~60 do PNCP não.
2. **Reprodutibilidade.** Arquivos estáticos não caem na véspera da defesa. Dada a instabilidade medida do PNCP, isso vale mais que atualidade num trabalho com prazo fixo.
3. **Riqueza do dado.** A tripla licitação/itens/participantes habilita atributos que o PNCP não expõe com a mesma facilidade.
4. **Valor acadêmico da limitação.** O corte em abr/2024 documenta uma descontinuidade regulatória real - vira seção de metodologia, não confissão de fragilidade.

**Risco assumido:** se a banca exigir dados do regime vigente, o recorte pode ser questionado. **Mitigação:** o conector PNCP, se implementado, demonstra que a arquitetura suporta a fonte atual.

## Alternativas descartadas

| Alternativa | Motivo |
|---|---|
| Apenas PNCP | Histórico curto e instabilidade comprovada |
| Apenas API do Portal da Transparência | `codigoOrgao` obrigatório inviabiliza carga em massa |
| Dados estaduais/municipais | Heterogeneidade de esquemas consumiria o semestre em normalização |
| Web scraping de portais | Frágil, manutenção alta, sem ganho acadêmico proporcional |

---

## Volume estimado

| Entidade | Linhas/mês | × 135 competências |
|---|---|---|
| `licitacao` | 2.537 | ~342 mil |
| `item_licitacao` | 51.808 | ~7 milhões |
| `participante_licitacao` | 161.400 | ~21,8 milhões |

Total aproximado de 29 milhões de linhas, entre 1 e 2 GB em disco. Volume que **cabe confortavelmente na memória de uma máquina** - não caracteriza processamento distribuído. Ver a decisão de dimensionamento em [[Licitações - Arquitetura do Sistema]].
