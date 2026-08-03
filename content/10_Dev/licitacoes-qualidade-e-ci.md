---
title: "Licitações - Qualidade e Integração Contínua"
type: note
tags: [tcc, licitacoes, ci, testes, qualidade, tdd]
created: "2026-08-03"
status: ready
---

Estratégia de qualidade do [[TCC - Sistema Inteligente para Licitações]]: o que é testado, o que é analisado estaticamente, e o que o CI impede de entrar na branch principal.

Atende ao RNF02, que o PDF original enuncia apenas como "código de fácil manutenção" - ver [[Licitações - Requisitos]] para o critério de aceitação.

## Análise estática no nível máximo

Cada stack roda a ferramenta mais estrita do seu ecossistema:

| Stack | Ferramenta | Nível |
|---|---|---|
| PHP | PHPStan 2.2.7 + Larastan 3.10 | **10** (máximo) |
| Python | Pyright 1.1.411 | **strict** |
| TypeScript | ESLint + typescript-eslint | **strictTypeChecked** |

**Larastan não é opcional no nível 10.** Sem a extensão do Laravel, as facades, o container de injeção e os métodos mágicos do Eloquent produzem centenas de falsos positivos que afogam o sinal real.

**Pyright em vez de mypy.** O SQLAlchemy 2.0 tem tipagem nativa (PEP 484), que o Pyright consome direto - o plugin do mypy passa a ser dependência desnecessária. Pyright também é mais rápido e, no caso deste projeto, apontou um erro que o mypy não viu.

**`strictTypeChecked` é o equivalente conceitual em TypeScript:** exige informação de tipos do compilador, pegando promise não aguardada, comparação sempre verdadeira e `any` implícito - coisas que regra puramente sintática não enxerga. No `tsconfig`, somam-se `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` e `useUnknownInCatchVariables`, que o Angular não liga por padrão.

### O que a adoção encontrou

Não foi cerimônia: cada ferramenta achou problema real na primeira execução.

- **PHP:** três erros, todos em código de exemplo do Laravel (model `User`, seeder, testes de exemplo). Removidos - não existe tabela `users` no esquema e autenticação está fora de escopo.
- **Python:** 33 erros. A maioria era anotação faltando, mas quatro eram legítimos: uso do retorno de `sessao.get()` sem verificar `None`, que falharia com `AttributeError` em vez de assertiva clara.
- **TypeScript:** três erros, um deles no `main.ts` gerado pelo próprio Angular.

## TDD por camada

O que testar muda conforme a camada, e em ML a aplicação ingênua não funciona.

**`etl/` - TDD clássico, alto retorno.** Parsers e transformações são funções puras sobre dados. Fixtures reais reduzidas a dezenas de linhas, preservando as peculiaridades de formato descritas em [[Licitações - Pipeline de Dados]].

**`api/` - TDD de contrato.** Formato da resposta contra o `openapi.json`, comportamento dos filtros, com banco semeado. Um teste precisa detectar divergência entre o Eloquent e o esquema real criado pelo Alembic - é a rede de segurança do acoplamento entre repositórios.

**`ml/` - testar o protocolo, não a acurácia.** Não existe teste de "o modelo é bom": isso é resultado experimental, não asserção. O que se testa:

- **Vazamento temporal no backtesting.** O teste mais importante do projeto. Nenhuma janela de treino pode conter competência posterior à prevista. É silencioso e invalida o trabalho inteiro.
- Determinismo com seed fixa.
- Contratos das features: colunas, tipos, faixas válidas.
- Correção do baseline sazonal ingênuo, que é a régua de comparação.

**`frontend/` - componentes e lógica de apresentação**, não aparência.

## Pipelines

Um workflow por repositório, disparado em push na `main` e em pull request.

**`tcc-jobs`** - Postgres como serviço, banco de teste criado em passo explícito (o script de init do compose não roda no runner), `ruff check`, `ruff format --check`, Pyright strict, migrations aplicadas, `alembic check`, pytest com cobertura.

**`tcc-api`** - Postgres como serviço, `Pint --test`, PHPStan nível 10, PHPUnit.

**`tcc-frontend`** - ESLint, Vitest, build.

Os três têm um job **`build-prod`** que compila o estágio de produção e valida o artefato: no `tcc-api` conferindo que `pdo_pgsql` está na imagem, no `tcc-jobs` que a CLI responde. O compose de desenvolvimento nunca exercita esses estágios - sem o job, um Dockerfile quebrado só apareceria no deploy.

### `alembic check` - guarda contra divergência de esquema

Detecta modelo SQLAlchemy alterado sem migration correspondente. Sem ele, a divergência apareceria apenas na carga de dados, semanas depois.

Uma armadilha aprendida na prática: o check compara o metadata com o estado **real** do banco, então exige as migrations aplicadas. Passou localmente e falhou no CI, porque o banco de desenvolvimento já estava migrado enquanto o do runner nasce vazio.

## Comandos locais

Todos a partir de `tcc-infra`, atravessando os cinco repositórios:

```bash
make check       # o que o CI roda: lint, análise estática e testes
make test        # apenas os testes das três stacks
make lint        # apenas lint e análise estática
make drift       # modelos divergiram das migrations?
make build-prod  # os estágios de produção compilam?
make verify      # verificação fim a fim da cadeia
```

## Estado atual

| Repositório | Testes | Cobertura |
|---|---|---|
| `tcc-jobs` | 33 | 97% |
| `tcc-api` | 2 | - |
| `tcc-frontend` | 4 | - |

Meta de cobertura: 80% em `etl/` e `ml/`, as camadas onde bug silencioso é mais caro - um parser errado contamina toda a base, e um erro de avaliação invalida as conclusões.

## Regra de conclusão

Nenhuma tarefa é considerada pronta sem rodar os testes e ver o resultado. Falhou, diz-se que falhou.
