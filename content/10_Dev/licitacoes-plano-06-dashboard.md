---
title: "Licitações - Plano 06 - Dashboard"
type: note
tags: [tcc, licitacoes, plano, angular, dashboard, echarts]
created: "2026-08-20"
status: ready
---

**Objetivo:** as cinco telas em Angular sobre o cliente HTTP **gerado** do `openapi.json`, tornando os resultados navegáveis por não-programador - critério de sucesso 5 do projeto.

**Arquitetura:** o frontend só conhece HTTP. O cliente é gerado do contrato, nunca escrito à mão (RNF03); serviços gerados não se editam. Standalone components, Angular Material para estrutura e ECharts para gráficos.

**Stack:** Angular 22.1, TypeScript 6.0, `ng-openapi-gen`, Angular Material, `ngx-echarts`, vitest (runner `@angular/build:unit-test`), ESLint `strictTypeChecked`.

**Cobre:** semanas 13-15. RF09 e a parte de tela do RNF06 (carga inicial < 2 s).

O dashboard **demonstra o sistema; não é um produto** - escopo das telas em [[TCC - Sistema Inteligente para Licitações]].

---

## Restrições globais

- **Identidade git:** `Gabriel Miranda <isporck0@gmail.com>`. Commits em português. Commit só quando pedido.
- **Vocabulário inviolável** também nas telas: score e posição, nunca termo de acusação - em label, título, tooltip ou texto. A tela de anomalias exibe o aviso permanente **que a API já fornece** no `meta`; o texto não se duplica no front.
- **Serviços gerados não se editam.** Qualquer ajuste de contrato acontece no `tcc-api` e regenera. Ordem de mudança: `tcc-api` (contrato) → `tcc-frontend` (cliente).
- **Teste componentes, não a aparência.**
- ESLint `strictTypeChecked` limpo e CI verde antes de cada commit.

## Orçamento desta fase

| Operação | Alvo |
|---|---|
| Carga inicial de uma tela (dados visíveis) | < 2 s |
| Build de produção | verde no CI (`build-prod`) |

---

## Verificações feitas antes de escrever este plano

### O gerador funciona contra o contrato real

`ng-openapi-gen` 1.0.5 (Node puro, cabe no container-first) gerou **7 models e 3 services** do `openapi.json` atual. O `openapi-generator` clássico foi descartado sem teste: roda em JVM, e o container do frontend não tem Java - instalar um JDK para gerar cliente violaria o container-first sem necessidade.

### Três endpoints não declaram o schema da resposta

`GET /analytics/modalidades`, `GET /analytics/orgaos` e `GET /anomalies/{id}` têm resposta 200 sem `content` - o cliente gerado fica sem tipo exatamente onde o dashboard mais consome. E o schema de `GET /licitacoes/{id}` referencia `Licitacao` sem os campos `itens`, `participantes` e `totais` que a resposta real carrega.

**Consequência:** a primeira tarefa é no `tcc-api`, completando o contrato - a ordem do polyrepo aplicada.

### O container do frontend não enxerga o contrato

O compose monta só `../tcc-frontend`. A documentação promete que o frontend lê `../tcc-api/openapi.json` em desenvolvimento; falta o mount read-only. Entra na tarefa de geração.

### CORS já funciona

`Origin: http://localhost:4200` recebe `Access-Control-Allow-Origin: *` - o padrão do Laravel para `api/*`. Nada a fazer; verificado para não descobrir na primeira tela.

### Estado de partida

Esqueleto: `HealthService` e uma rota. Sem Material, sem ECharts. O runner de teste é o vitest do Angular 22 (`@angular/build:unit-test`). O `environment.ts` já aponta para `localhost:8000` com o motivo documentado (quem requisita é o navegador, não o container).

### O dado que as telas vão encontrar

Verdades medidas nos planos anteriores que o front precisa respeitar:

| Fato | Consequência na tela |
|---|---|
| `202404` e `201812` são parciais; a API marca com `parcial: true` e motivo | O gráfico de evolução DEVE distinguir esses pontos (cor/tracejado) e exibir o motivo - senão o fim da série parece queda real |
| `valor` é string decimal (chega a 10^20) | Nunca `parseFloat` para exibir; formatação por string. Eixos de gráfico podem usar number com perda declarada |
| `data_abertura` é 72,6% nula | A coluna existe na consulta, mas nula é o caso normal - exibir "-", não erro |
| Top do ranking de anomalias é dominado pela classe `contem_item_implausivel` | A tela de anomalias mostra a flag e permite filtrar a classe |
| Ranking de fornecedores por período longo estoura 500 ms | A tela usa o global por padrão; o filtro de período avisa que pode demorar |

---

## Tarefa 1: Completar o contrato no tcc-api

- [ ] Declarar o schema de resposta de `/analytics/modalidades`, `/analytics/orgaos` e `/anomalies/{id}`.
- [ ] Schema próprio para o detalhe de licitação (`LicitacaoDetalhe`: itens, participantes, totais).
- [ ] `php artisan openapi:export`; o teste de divergência garante o resto. Testes e PHPStan verdes; commit.

## Tarefa 2: Geração do cliente

- [ ] Mount read-only no compose: `../tcc-api/openapi.json` → `/contrato/openapi.json` no serviço frontend.
- [ ] `ng-openapi-gen` como devDependency, config em `ng-openapi-gen.json`, saída em `src/app/api/` (gitignorada? **Não**: versionada, para o CI não depender do outro repo - e um script `npm run gerar-api` que regenera e falha se divergir, espelhando o `openapi:export --check` da API).
- [ ] Teste que falha quando o cliente versionado diverge do contrato montado.
- [ ] `HealthService` manual morre; a tela usa o serviço gerado. Commit.

## Tarefa 3: Casca da aplicação

- [ ] Angular Material (tema claro, densidade padrão) e `ngx-echarts` (só o `echarts/core` com os gráficos usados - bundle importa para os 2 s).
- [ ] Layout com navegação lateral para as cinco telas, rotas lazy por tela.
- [ ] Interceptor de erro HTTP único: falha de API vira mensagem visível, nunca console silencioso.
- [ ] Testes de componente da casca; commit.

## Tarefa 4: Tela 1 - Visão geral

- [ ] Indicadores agregados (licitações, valor total, período coberto) de `/analytics/evolucao`; estado da última ingestão de `/health`.
- [ ] Teste: os cards refletem a resposta mockada; erro de API mostra aviso.

## Tarefa 5: Tela 2 - Consulta de licitações

- [ ] Tabela paginada server-side sobre `GET /licitacoes` com os filtros do contrato (órgão, modalidade, UF, competência, situação, faixa de valor, busca).
- [ ] Período por `competencia` (a API já rejeita o resto); `data_abertura` nula exibe "-".
- [ ] Detalhe (tela ou painel) com itens e participantes, avisando quando os totais excedem os 500 devolvidos.
- [ ] Testes: filtros disparam a query certa; paginação; estado vazio.

## Tarefa 6: Tela 3 - Análise histórica

- [ ] Evolução temporal (ECharts) com **as competências parciais distinguidas e o motivo do `meta` exibido**.
- [ ] Rankings de órgãos e fornecedores e distribuição por modalidade.
- [ ] Fornecedores: global por padrão; com período, exibir indicador de granularidade que a API devolve.
- [ ] Testes de componente com respostas mockadas.

## Tarefa 7: Tela 4 - Previsões

- [ ] Série observada (`/analytics/evolucao`) + prevista (`/forecast`) com **intervalo de confiança sombreado**.
- [ ] Seletor de série (global, órgão, modalidade) e alvo (quantidade, valor).
- [ ] A procedência do `meta` (algoritmo, janela, quando rodou) visível - o número sem procedência é oráculo.
- [ ] Teste: o gráfico recebe observado e previsto alinhados por competência.

## Tarefa 8: Tela 5 - Anomalias

- [ ] Ranking paginado de `/anomalies` com **o aviso permanente vindo do `meta`** - visível sem interação, não atrás de tooltip.
- [ ] Detalhe com a contribuição dos atributos (gráfico de barras) e o texto do método.
- [ ] Filtro pela flag `contem_item_implausivel` exposta nos valores - o topo é dominado por essa classe, e o usuário precisa poder separá-la.
- [ ] Teste de vocabulário nas telas: nenhum template contém termo proibido (teste que varre os HTML).

## Tarefa 9: Medição dos 2 segundos e revisão

- [ ] Medir a carga inicial de cada tela (Lighthouse ou navegação instrumentada) contra a API real; registrar os números.
- [ ] Bundle de produção: tamanho por rota registrado; `build-prod` do CI verde.
- [ ] Revisão no padrão dos planos anteriores: mutações onde houver lógica (formatação decimal, alinhamento de séries), vocabulário, e conferência das telas contra a API real.

---

## Critério de conclusão

- [ ] Contrato completo (nenhuma resposta 200 sem schema) e cliente regenerado
- [ ] Cliente gerado versionado, com teste de divergência nos dois lados
- [ ] Cinco telas navegáveis contra a API real
- [ ] Competências parciais distinguidas na evolução; procedência visível nas previsões; aviso permanente e filtro de classe nas anomalias
- [ ] Nenhum termo proibido em template, label ou tooltip - com teste
- [ ] Carga inicial < 2 s por tela, medida e registrada
- [ ] ESLint strictTypeChecked limpo; testes verdes; CI verde nos repositórios tocados

## Próximo plano

**Plano 07 - Fechamento** (semana 16): cobertura, README executável de ponta a ponta e material de redação - com todos os números medidos já registrados nas notas.
