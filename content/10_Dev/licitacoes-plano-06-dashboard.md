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

### O gerador funciona - mas o contrato atual produz cliente INVÁLIDO

`ng-openapi-gen` 1.0.5 (Node puro, cabe no container-first) foi escolhido; o `openapi-generator` clássico roda em JVM e o container não tem Java.

A validação inicial ("7 models e 3 services") olhou a linha de log, não o código - e a revisão multiagente inspecionou de verdade:

- **O código gerado do contrato atual não compila.** O swagger-php emite `operationId` como hash md5, e 6 dos 10 viram nomes de função começando com dígito - TypeScript sintaticamente inválido. Com `operationId` explícito, compila limpo. **Sem a Tarefa 1, não existe cliente.**
- **Endpoint sem schema de resposta é pior que `any`:** o gerador emite `responseType: 'text'` e descarta o corpo (`body: undefined`) - o JSON nunca chega ao chamador.
- Por padrão o gerador só emite a API funcional (`fn/`); as classes de service exigem `"services": true`. Os métodos devolvem `Promise`, não `Observable` - registrado como decisão.
- **Determinismo confirmado** (duas gerações, diff vazio) - o teste de divergência é viável -, mas os nomes de arquivo derivam do operationId: os IDs explícitos precisam existir ANTES da primeira geração versionada.
- **`exactOptionalPropertyTypes` do projeto quebra o output do gerador** (`HttpContext | undefined` em propriedade opcional). A saída escolhida: pós-processamento no script `gerar-api` - desligar a flag contrariaria o padrão do repositório.
- Compatibilidades confirmadas: Material 22.1.3 e ngx-echarts 22 com Angular 22.1; baseline do bundle inicial de hoje: **234,9 kB raw / 64,3 kB transfer**.
- O `tsconfig.json` do projeto **não tem `strict: true`** e traz `noPropertyAccessFromIndexSignature` duplicado - entra na Tarefa 3.

### O contrato tem mais lacunas do que as três visíveis

Comparação campo a campo entre resposta real e schema, nos 10 caminhos:

- `GET /analytics/modalidades`, `/analytics/orgaos` e `/anomalies/{id}`: resposta 200 **sem content** (e o corpo é descartado pelo gerador, ver acima).
- `GET /licitacoes/{id}`: schema sem `itens`, `participantes`, `totais`. **E havia bug**: `totais` contava a coleção truncada - licitação com 4.620 itens devolvia 500. Corrigido na revisão (withCount), com teste que excede o teto.
- `GET /anomalies` (lista): `meta` sem `per_page`/`current_page` no schema; sem `last_page` na resposta (divergindo de `/licitacoes`); `licitacao` declarada como object sem propriedades - as colunas da tela 5 virariam vazio.
- **A lista não expõe `contem_item_implausivel` nem aceita filtro por classe** - o filtro da tela 5 seria N+1 no detalhe. Exige mudança de API, não só de schema.
- **Não existe endpoint que liste as séries disponíveis** para o seletor da tela 4 - são 291 séries com modelo, e série inexistente devolve 200 vazio, indistinguível de erro.
- Nenhuma resposta de erro (404/422) tem schema; quatro endpoints de analytics retornam 422 real sem declará-lo.
- `executado_em` em três formatos: ISO 8601 no `/health`, cru (`AAAA-MM-DD hh:mm:ss.ffffff`) no `/forecast` e `/anomalies` - e o `/forecast` declara `date-time` falsamente.
- Menores: descrição de arquivo vazada no componente `Modalidade`; atributos `#[OA\Get]` anexados a helpers privados em dois controllers.

**Consequência:** a primeira tarefa é no `tcc-api` e é maior do que parecia - a ordem do polyrepo aplicada.

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
| Top do ranking de anomalias é dominado pela classe (82 dos top-100) | A tela mostra a flag e filtra a classe - **depende da lista expor a flag e aceitar o filtro (Tarefa 1)** |
| Fornecedores por período longo: **4 a 9 s no endpoint real** (10 anos), 0,3 s em 6 meses | Global por padrão; o filtro de período limita o intervalo ou avisa a demora com o número real |

---

## Ordem de execução

**1 → 2 → 3 → 4 → 5 → 8 → 6 → 7 → 9.** A tela de anomalias (Tarefa 8) sobe ANTES da análise histórica e das previsões: as telas 3 e 4 são as cortáveis pela ordem de corte do projeto, e a de anomalias sustenta a contribuição central. Se as telas 3-4 caírem, a obrigação de distinguir competências parciais migra para o gráfico que restar na visão geral (Tarefa 4).

## Tarefa 1: Completar o contrato no tcc-api

Maior do que o esboço original - a revisão achou nove lacunas, e três exigem código de API, não só anotação:

- [ ] **`operationId` explícito em todos os 10 endpoints** (ex.: `listarLicitacoes`, `obterAnomalia`). Sem isto o cliente gerado nem compila; e os nomes de arquivo gerados derivam deles, então precisam nascer certos.
- [ ] Schema de resposta de `/analytics/modalidades`, `/analytics/orgaos` e `/anomalies/{id}` (endpoint sem schema tem o corpo descartado pelo cliente gerado).
- [ ] `LicitacaoDetalhe` (itens, participantes, totais) para `/licitacoes/{id}` - o fix do `totais` já está commitado.
- [ ] `/anomalies` (lista): expor `contem_item_implausivel` por item **e aceitar `?implausivel=`** (o filtro da tela 5 não pode ser N+1 no detalhe); completar `meta` no schema e adicionar `last_page` na resposta, espelhando `/licitacoes`; declarar as propriedades de `licitacao`.
- [ ] **Novo endpoint `GET /forecast/series`**: as 291 séries com modelo (global + 11 modalidades + 279 órgãos, com nome), para o seletor da tela 4 - hoje série inexistente devolve 200 vazio, indistinguível de "sem modelo".
- [ ] Componentes de erro `Erro {message}` e `ErroValidacao {message, errors}`; declarar 404 onde há `{id}` e 422 nos analytics que validam parâmetro.
- [ ] `executado_em` em ISO 8601 nos três lugares (hoje `/health` difere de `/forecast` e `/anomalies`, e `/forecast` declara `date-time` falsamente).
- [ ] Menores: descrição vazada no componente `Modalidade`; atributos OA fora de helpers privados.
- [ ] Estender o teste de contrato resposta-vs-schema aos schemas novos. `openapi:export`; PHPStan 10, Pint e PHPUnit verdes; commit; CI.

## Tarefa 2: Geração do cliente

- [ ] Mount read-only no compose: `../tcc-api/openapi.json` → `/contrato/openapi.json` no serviço frontend (commit no `tcc-infra`). O script aceita o caminho por variável de ambiente, com default para o mount - fora do compose usa `../tcc-api/openapi.json`.
- [ ] `ng-openapi-gen` **1.0.5 travado** (o output é versionado; atualização de gerador é mudança deliberada), config com **`"services": true`** em `ng-openapi-gen.json`, saída em `src/app/api/` - **versionada**, para o CI não depender do outro repo. Os services devolvem `Promise`, não `Observable`: os componentes consomem com `async/await` ou `resource()`, decisão registrada.
- [ ] Script `npm run gerar-api`: regenera, **pós-processa** o que o `exactOptionalPropertyTypes` rejeita no output (a flag do projeto não se desliga), e `--check` falha se o versionado divergir - espelho do `openapi:export --check` da API. O CI roda o `--check` com checkout do `tcc-api` (mesmo desenho do CI da API com o `tcc-jobs`).
- [ ] ESLint: `src/app/api/` fora do lint (código gerado não se linta; anotar o porquê no config).
- [ ] `HealthService` manual morre; a tela usa o serviço gerado. Commit.

## Tarefa 3: Casca da aplicação

- [ ] **`tsconfig.json` primeiro:** adicionar `"strict": true` e remover a flag duplicada - o esqueleto nasceu sem o modo estrito que o projeto exige.
- [ ] Angular Material (tema claro, densidade padrão) e `ngx-echarts` (só `echarts/core` com os gráficos usados - bundle importa para os 2 s; baseline de hoje: 234,9 kB raw).
- [ ] Layout com navegação lateral para as cinco telas, rotas lazy por tela.
- [ ] Interceptor de erro HTTP único: falha de API vira mensagem visível, nunca console silencioso.
- [ ] Testes de componente da casca; commit.

## Padrão de teste das telas (Tarefas 4-8)

Fixado aqui para não redecidir por tela:

- **HTTP:** `provideHttpClientTesting`, assertando a URL e a query que o serviço gerado emite - é o teste de que o filtro certo vira o parâmetro certo.
- **Gráficos:** funções puras `resposta → EChartsOption`, testadas sem renderizar. Invariantes com teste: banda de confiança nunca sem a linha central; observado e previsto alinhados por competência; parciais visualmente distintas.
- **Formatação decimal** (string até 10^20, sem `parseFloat`): função pura, alvo de TDD e mutação.
- Estado de erro e estado vazio testados em toda tela.

## Tarefa 4: Tela 1 - Visão geral

- [ ] Indicadores agregados (licitações, valor total, período coberto) de `/analytics/evolucao`; estado da última ingestão de `/health`.
- [ ] Teste: os cards refletem a resposta mockada; erro de API mostra aviso.

## Tarefa 5: Tela 2 - Consulta de licitações

- [ ] Tabela paginada server-side sobre `GET /licitacoes` com os filtros do contrato (órgão, modalidade, UF, competência, situação, faixa de valor, busca).
- [ ] Período por `competencia` (a API já rejeita o resto); `data_abertura` nula exibe "-".
- [ ] Detalhe (tela ou painel) com itens e participantes, avisando quando os totais excedem os 500 devolvidos.
- [ ] Testes: filtros disparam a query certa; paginação; estado vazio.

## Tarefa 8: Tela 5 - Anomalias (antes das cortáveis)

- [ ] Ranking paginado de `/anomalies` com **o aviso permanente vindo do `meta`** - visível sem interação, não atrás de tooltip. Em erro de API não há dados na tela, logo não há leitura errada possível - o aviso não se duplica no front nem em fallback.
- [ ] Filtro pela flag `contem_item_implausivel` da lista (Tarefa 1) - o topo é dominado pela classe (82 dos top-100) e o usuário precisa separá-la.
- [ ] Detalhe com a contribuição dos atributos (gráfico de barras) e o texto do método vindo do `meta`.
- [ ] **Teste de vocabulário: varre `src/**/*.html` e `src/**/*.ts`** (tooltips e labels vivem em TS), excluindo `src/app/api/`, com a mesma lista de dez termos do Plano 03.

## Tarefa 6: Tela 3 - Análise histórica

- [ ] Evolução temporal (ECharts) com **as competências parciais distinguidas e o motivo do `meta` exibido**.
- [ ] Rankings de órgãos e fornecedores e distribuição por modalidade.
- [ ] Fornecedores: global por padrão; o filtro de período limita o intervalo selecionável ou avisa a demora com o número medido (4-9 s em 10 anos).
- [ ] Testes de componente com respostas mockadas.

## Tarefa 7: Tela 4 - Previsões

- [ ] Seletor de série alimentado por `GET /forecast/series` (Tarefa 1) - só séries que têm modelo são selecionáveis, eliminando o "vazio ou inexistente?".
- [ ] Série observada (`/analytics/evolucao`) + prevista (`/forecast`) com **intervalo de confiança sombreado**; alvo (quantidade, valor).
- [ ] A procedência do `meta` (algoritmo, janela, quando rodou) visível - o número sem procedência é oráculo. **Sem métrica de erro na tela**: o backtesting não está exposto pela API, e número de acurácia sem baseline ao lado violaria a regra de gráficos - decisão registrada, a avaliação vive na nota de modelos.
- [ ] Teste: alinhamento observado/previsto por competência; banda nunca sem linha.

## Tarefa 9: Produção, medição dos 2 s e revisão

- [ ] **`nginx.conf` no estágio de produção com proxy de `/api` para o serviço da API** - o `environment.production.ts` aponta para `/api` e hoje o nginx estático devolveria 404. `make build-prod` e `make verify` cobrem o caminho.
- [ ] **Medição do RNF06, especificada:** build de produção servido pelo nginx do compose, contra a API real com os 91M carregados. Navegação instrumentada (Playwright) marcando **"dados visíveis"** = primeira renderização com dado da API na tela (não `load`). 10 execuções por tela, **p95**, cache frio; rede local sem throttling - condição declarada junto do número.
- [ ] Bundle de produção por rota registrado; `build-prod` do CI verde.
- [ ] Revisão no padrão dos planos anteriores: mutações onde houver lógica (formatação decimal, alinhamento de séries, opções de gráfico), vocabulário, e conferência das telas contra a API real.

---

## Critério de conclusão

- [ ] Contrato completo: operationIds explícitos, nenhuma 200 sem schema, erros declarados, filtro e flag na lista de anomalias, endpoint de séries
- [ ] Cliente gerado versionado, com teste de divergência nos dois lados do contrato
- [ ] Cinco telas navegáveis contra a API real, na ordem 4-5-8-6-7
- [ ] Competências parciais distinguidas; procedência visível nas previsões; aviso permanente e filtro de classe nas anomalias
- [ ] Nenhum termo proibido em HTML ou TS de `src/` (fora o gerado) - com teste
- [ ] Build de produção servível: nginx com proxy, `make verify` passando por ele
- [ ] Carga < 2 s por tela no p95 de 10 execuções, condições registradas
- [ ] `strict: true` no tsconfig; ESLint strictTypeChecked limpo; testes verdes; CI verde nos repositórios tocados

## Próximo plano

**Plano 07 - Fechamento** (semana 16): cobertura, README executável de ponta a ponta e material de redação - com todos os números medidos já registrados nas notas.
