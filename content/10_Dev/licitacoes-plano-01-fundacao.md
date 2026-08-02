---
title: "Licitações - Plano 01 - Fundação"
type: note
tags: [tcc, licitacoes, plano, docker, postgresql, alembic]
created: "2026-08-02"
status: ready
---

> **Para execução assistida:** use `superpowers:subagent-driven-development` ou `superpowers:executing-plans`. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** deixar os quatro repositórios operacionais, com PostgreSQL de pé, esquema completo aplicado por migration e suíte de testes rodando em cada stack.

**Arquitetura:** desenvolvimento **container-first** - o host só precisa de Docker. `tcc-infra` sobe PostgreSQL via Docker Compose. `tcc-jobs` define o esquema em SQLAlchemy e o aplica por Alembic - é o dono do banco. `tcc-api` e `tcc-frontend` ganham esqueleto mínimo com healthcheck e teste, provando que a cadeia inteira funciona antes de qualquer regra de negócio.

**Stack:** Docker Compose com Dockerfiles multi-stage (`dev` e `prod`), PostgreSQL 16, Python 3.12 + uv + SQLAlchemy 2.0 + Alembic + Typer, PHP 8.3 + Laravel, Angular. Código do host chega aos containers por bind mount; dependências ficam em volumes nomeados.

**Cobre:** semanas 1-2 do cronograma. RNF01, RNF04, RNF05.

Contexto em [[TCC - Sistema Inteligente para Licitações]], [[Licitações - Arquitetura do Sistema]] e [[Licitações - Modelo de Dados]].

---

## Restrições globais

Valem para todas as tarefas:

- **Identidade git:** `Gabriel Miranda <isporck0@gmail.com>`. Sem trailer de co-autoria.
- **Hífen simples** (`-`) em todo texto, inclusive intervalos (`3-5`).
- **Alembic é o único dono do esquema.** Migrations do Laravel permanecem desabilitadas.
- **Nomenclatura proibida:** nunca `suspeita`, `irregularidade`, `fraude` ou equivalente, em nenhum identificador, label ou comentário.
- **Identificadores em inglês**, comentários e commits em português.
- **Commits:** `tipo(escopo): descrição`, imperativo.
- Nenhum `.ai-context.md` é versionado - já estão no `.gitignore`.
- Nenhum dado do pipeline é versionado (`data/`, `*.parquet`, `*.zip`).

---

## Estado do ambiente

Verificado em 2026-08-02, WSL2 Ubuntu 24.04:

| Ferramenta | Estado |
|---|---|
| Python 3.12.3 | instalado (usado só fora do container, se preciso) |
| Node 22.22.0 | instalado |
| uv 0.12.1 | instalado em `~/.local/bin` |
| gh 2.97.0 | instalado, autenticado como `ddank0` |
| **Docker** | **ausente - único bloqueio** |

O desenvolvimento é **container-first**: PHP, Composer e as dependências de cada stack vivem apenas nas imagens. O host precisa só de Docker. Isso elimina divergência de versão entre máquina e container, e torna verdadeira a frase "clone e rode `docker compose up`" - que é critério de sucesso do projeto.

`sudo` exige senha, então a Tarefa 0 é executada pelo autor.

## Estrutura de arquivos

**tcc-infra**
```
docker-compose.yml      postgres, jobs, api, frontend - todos em modo dev
.env.example            variáveis sem valores reais
scripts/init-test-db.sh cria o banco de teste na inicialização
Makefile                atalhos que atravessam os cinco repositórios
```

**tcc-jobs**
```
Dockerfile                   multi-stage: dev (bind mount) e prod (embutido)
pyproject.toml               dependências e scripts (uv)
alembic.ini                  configuração do Alembic
src/tcc_jobs/
├── core/config.py           Settings via pydantic-settings
├── db/base.py               DeclarativeBase
├── db/session.py            engine e sessionmaker
├── db/models/dimensoes.py   orgao, unidade_gestora, fornecedor
├── db/models/fatos.py       licitacao, item_licitacao, participante_licitacao
├── db/models/operacional.py ingestao_log
├── db/models/analitico.py   serie_mensal, execucao_modelo, previsao, score_anomalia
├── db/migrations/           versões Alembic
└── cli.py                   Typer - comandos vazios, contrato definido
tests/
├── conftest.py              fixture de engine e schema
├── test_config.py
├── test_models.py
└── test_migrations.py
```

**tcc-api**
```
Dockerfile              multi-stage: dev (bind mount) e prod (código embutido)
routes/api.php          GET /health
tests/Feature/HealthTest.php
database/migrations/README.md   aviso: o dono do esquema é o Alembic
```

**tcc-frontend**
```
Dockerfile              multi-stage: dev (ng serve), build e prod (nginx)
src/environments/environment.ts
src/app/core/health.service.ts
src/app/core/health.service.spec.ts
```

Nos três repositórios o padrão é o mesmo: o estágio `dev` não copia código - ele chega por bind mount, e as dependências ficam em volume nomeado, fora do repositório. O estágio `prod` embute tudo e descarta ferramentas de desenvolvimento.

---

## Tarefa 0: Instalar o Docker

Só o autor pode executar - exige `sudo`. É o único pré-requisito do host.

**Arquivos:** nenhum.

- [ ] **Passo 1: Instalar**

No WSL2, o caminho mais simples é o Docker Desktop no Windows com integração WSL2 ativada (Settings → Resources → WSL Integration → habilitar a distro Ubuntu). Alternativa sem Docker Desktop:

```bash
sudo apt update && sudo apt install -y docker.io docker-compose-v2
sudo usermod -aG docker $USER
```

Depois **feche e reabra o terminal** para o grupo valer.

- [ ] **Passo 2: Verificar**

```bash
docker run --rm hello-world
docker compose version
```

Esperado: mensagem de boas-vindas e versão do compose. Se pedir `sudo`, o grupo ainda não aplicou - reabra o terminal.

- [ ] **Passo 3: Definir o compose padrão do shell**

O `docker compose` respeita a variável `COMPOSE_FILE`. Defini-la permite rodar os comandos de qualquer diretório, sem `-f` a cada vez:

```bash
echo 'export COMPOSE_FILE=$HOME/dev/TCC/tcc-infra/docker-compose.yml' >> ~/.bashrc
source ~/.bashrc
echo $COMPOSE_FILE
```

Esperado: o caminho impresso. Todos os comandos `docker compose` do restante do plano assumem isso.

> PHP, Composer e as dependências Python ficam nas imagens. Não instale nada disso no host: divergência entre a versão local e a do container é justamente a classe de erro que o container-first elimina.

## Tarefa 1: Compose com PostgreSQL e o container de jobs

**Arquivos:**
- Criar: `tcc-infra/docker-compose.yml`
- Criar: `tcc-infra/.env.example`
- Criar: `tcc-infra/scripts/init-test-db.sh`
- Criar: `tcc-jobs/Dockerfile`

**Interfaces:**
- Produz: PostgreSQL em `localhost:5432` com os bancos `tcc` e `tcc_test`; serviço `jobs` de pé, com o código do host montado em `/app`, pronto para `docker compose exec`.

- [ ] **Passo 1: Criar o `.env.example`**

```bash
# tcc-infra/.env.example
POSTGRES_DB=tcc
POSTGRES_USER=tcc
POSTGRES_PASSWORD=troque-esta-senha
POSTGRES_PORT=5432
```

- [ ] **Passo 2: Criar o script de banco de teste**

Arquivo `tcc-infra/scripts/init-test-db.sh`:

```bash
#!/bin/bash
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    CREATE DATABASE ${POSTGRES_DB}_test;
    GRANT ALL PRIVILEGES ON DATABASE ${POSTGRES_DB}_test TO $POSTGRES_USER;
EOSQL
```

```bash
chmod +x tcc-infra/scripts/init-test-db.sh
```

> Scripts em `/docker-entrypoint-initdb.d/` rodam apenas na primeira inicialização do volume. Se o banco de teste não aparecer, é porque o volume já existia: `docker compose down -v` e suba de novo.

- [ ] **Passo 3: Dockerfile multi-stage dos jobs**

Arquivo `tcc-jobs/Dockerfile`:

```dockerfile
# --- desenvolvimento: sem código embutido, chega por bind mount ---
FROM python:3.12-slim AS dev

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

ENV UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:$PATH"

WORKDIR /app
CMD ["sleep", "infinity"]

# --- produção: código embutido, sem dependências de desenvolvimento ---
FROM python:3.12-slim AS prod

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

ENV UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv \
    PATH="/opt/venv/bin:$PATH"

WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY . .

ENTRYPOINT ["uv", "run", "tcc"]
CMD ["--help"]
```

Dois detalhes que evitam dor de cabeça:

`UV_PROJECT_ENVIRONMENT=/opt/venv` põe o ambiente virtual **fora** de `/app`. Sem isso, o `.venv` criado no container seria escrito na pasta do host pelo bind mount, misturando binários Linux do container com o que você tenha no WSL.

O estágio `dev` não copia código nem roda `uv sync` no build. O código chega por bind mount e as dependências são instaladas depois - por isso este Dockerfile funciona mesmo antes de o `pyproject.toml` existir, que é o caso agora.

- [ ] **Passo 4: Criar o `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: tcc-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${POSTGRES_DB}
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    ports:
      - "${POSTGRES_PORT}:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./scripts/init-test-db.sh:/docker-entrypoint-initdb.d/init-test-db.sh:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 10

  jobs:
    build:
      context: ../tcc-jobs
      target: dev
    container_name: tcc-jobs
    volumes:
      - ../tcc-jobs:/app
      - jobs-venv:/opt/venv
      - ../data:/data
    environment:
      DATABASE_URL: postgresql+psycopg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}
      TEST_DATABASE_URL: postgresql+psycopg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}_test
      DATA_DIR: /data
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  pgdata:
  jobs-venv:
```

O serviço `jobs` usa `sleep infinity` para ficar de pé e aceitar `docker compose exec` - que é instantâneo, enquanto `docker compose run` criaria um container novo a cada teste. Numa fase com dezenas de ciclos TDD, a diferença é sentida.

`jobs-venv` é volume nomeado, não bind mount: o ambiente virtual pertence ao container e não polui o repositório.

- [ ] **Passo 5: Subir**

```bash
cd ~/dev/TCC/tcc-infra
cp .env.example .env
mkdir -p ../data
docker compose up -d --build
docker compose ps
```

Esperado: `tcc-postgres` com status `healthy` e `tcc-jobs` em execução.

- [ ] **Passo 6: Verificar os bancos**

```bash
docker compose exec postgres psql -U tcc -l
```

Esperado: `tcc` e `tcc_test` na listagem.

- [ ] **Passo 7: Verificar o container de jobs**

```bash
docker compose exec jobs python --version
docker compose exec jobs uv --version
docker compose exec jobs ls /app
```

Esperado: Python 3.12.x, uv instalado, e `/app` mostrando os arquivos de `tcc-jobs` (README.md, .gitignore, Dockerfile).

- [ ] **Passo 8: Commit**

```bash
cd ~/dev/TCC/tcc-infra
git add docker-compose.yml .env.example scripts/init-test-db.sh
git commit -m "feat: compose com postgres e container de desenvolvimento dos jobs"
git push origin main

cd ~/dev/TCC/tcc-jobs
git add Dockerfile
git commit -m "feat: dockerfile multi-stage com estágios dev e prod"
git push origin main
```

---

## Tarefa 2: Esqueleto do projeto Python

**Arquivos:**
- Criar: `tcc-jobs/pyproject.toml`
- Criar: `tcc-jobs/src/tcc_jobs/__init__.py`
- Criar: `tcc-jobs/src/tcc_jobs/core/__init__.py`
- Criar: `tcc-jobs/src/tcc_jobs/core/config.py`
- Criar: `tcc-jobs/.env.example`
- Teste: `tcc-jobs/tests/test_config.py`

**Interfaces:**
- Produz: `tcc_jobs.core.config.Settings` com `database_url: str`, `test_database_url: str`, `data_dir: Path`; e a instância `settings`.

- [ ] **Passo 1: Criar o `pyproject.toml`**

```toml
[project]
name = "tcc-jobs"
version = "0.1.0"
description = "ETL, features e modelos do TCC de licitações"
requires-python = ">=3.12"
dependencies = [
    "sqlalchemy>=2.0",
    "alembic>=1.13",
    "psycopg[binary]>=3.2",
    "typer>=0.12",
    "pydantic-settings>=2.4",
]

[dependency-groups]
dev = [
    "pytest>=8.0",
    "pytest-cov>=5.0",
    "ruff>=0.6",
]

[project.scripts]
tcc = "tcc_jobs.cli:app"

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[tool.hatch.build.targets.wheel]
packages = ["src/tcc_jobs"]

[tool.ruff]
line-length = 100
target-version = "py312"

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B"]

[tool.pytest.ini_options]
pythonpath = ["src"]
testpaths = ["tests"]
```

> Polars, scikit-learn e statsforecast entram nos planos 02 e 04. Instalar agora seria peso morto na imagem.

- [ ] **Passo 2: Criar o `.env.example`**

```bash
# tcc-jobs/.env.example
DATABASE_URL=postgresql+psycopg://tcc:troque-esta-senha@localhost:5432/tcc
TEST_DATABASE_URL=postgresql+psycopg://tcc:troque-esta-senha@localhost:5432/tcc_test
DATA_DIR=../data
```

- [ ] **Passo 3: Escrever o teste que falha**

Arquivo `tcc-jobs/tests/test_config.py`:

```python
from pathlib import Path

from tcc_jobs.core.config import Settings


def test_settings_le_variaveis_de_ambiente(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://u:p@host:5432/db")
    monkeypatch.setenv("TEST_DATABASE_URL", "postgresql+psycopg://u:p@host:5432/db_test")
    monkeypatch.setenv("DATA_DIR", "/tmp/dados")

    s = Settings()

    assert s.database_url == "postgresql+psycopg://u:p@host:5432/db"
    assert s.test_database_url == "postgresql+psycopg://u:p@host:5432/db_test"
    assert s.data_dir == Path("/tmp/dados")


def test_data_dir_tem_padrao(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql+psycopg://u:p@host:5432/db")
    monkeypatch.setenv("TEST_DATABASE_URL", "postgresql+psycopg://u:p@host:5432/db_test")
    monkeypatch.delenv("DATA_DIR", raising=False)

    assert Settings().data_dir == Path("data")
```

- [ ] **Passo 4: Rodar o teste e ver falhar**

```bash
# você edita os arquivos no host; os comandos rodam no container
docker compose exec jobs uv sync --all-groups
docker compose exec jobs uv run pytest tests/test_config.py -v
```

Esperado: FAIL com `ModuleNotFoundError: No module named 'tcc_jobs.core'`.

- [ ] **Passo 5: Implementar o mínimo**

Criar `src/tcc_jobs/__init__.py` e `src/tcc_jobs/core/__init__.py` vazios, e `src/tcc_jobs/core/config.py`:

```python
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Configuração lida de variáveis de ambiente ou do .env."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    test_database_url: str
    data_dir: Path = Path("data")


settings = Settings()  # type: ignore[call-arg]
```

- [ ] **Passo 6: Rodar o teste e ver passar**

```bash
# sem .env aqui: DATABASE_URL e TEST_DATABASE_URL vêm do compose
docker compose exec jobs uv run pytest tests/test_config.py -v
```

Esperado: 2 passed.

- [ ] **Passo 7: Verificar o lint**

```bash
docker compose exec jobs uv run ruff check .
docker compose exec jobs uv run ruff format --check .
```

Esperado: sem erros. Se o format reclamar, rode `uv run ruff format .`.

- [ ] **Passo 8: Commit**

```bash
git add pyproject.toml uv.lock .env.example src tests
git commit -m "feat: esqueleto do projeto com configuração por ambiente"
git push origin main
```

---

## Tarefa 3: Base declarativa e sessão

**Arquivos:**
- Criar: `tcc-jobs/src/tcc_jobs/db/__init__.py`
- Criar: `tcc-jobs/src/tcc_jobs/db/base.py`
- Criar: `tcc-jobs/src/tcc_jobs/db/session.py`
- Teste: `tcc-jobs/tests/test_session.py`

**Interfaces:**
- Produz: `tcc_jobs.db.base.Base` (DeclarativeBase); `tcc_jobs.db.session.criar_engine(url: str) -> Engine` e `criar_sessionmaker(engine: Engine) -> sessionmaker[Session]`.

- [ ] **Passo 1: Escrever o teste que falha**

Arquivo `tcc-jobs/tests/test_session.py`:

```python
from sqlalchemy import Engine, text
from sqlalchemy.orm import Session

from tcc_jobs.core.config import settings
from tcc_jobs.db.session import criar_engine, criar_sessionmaker


def test_criar_engine_devolve_engine():
    engine = criar_engine(settings.test_database_url)
    assert isinstance(engine, Engine)


def test_conexao_com_banco_de_teste_funciona():
    engine = criar_engine(settings.test_database_url)
    with engine.connect() as conn:
        assert conn.execute(text("SELECT 1")).scalar() == 1


def test_sessionmaker_produz_sessao_utilizavel():
    engine = criar_engine(settings.test_database_url)
    with criar_sessionmaker(engine)() as sessao:
        assert isinstance(sessao, Session)
        assert sessao.execute(text("SELECT 42")).scalar() == 42
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
docker compose exec jobs uv run pytest tests/test_session.py -v
```

Esperado: FAIL com `ModuleNotFoundError: No module named 'tcc_jobs.db'`.

- [ ] **Passo 3: Implementar**

`src/tcc_jobs/db/__init__.py` vazio. `src/tcc_jobs/db/base.py`:

```python
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Base declarativa de todos os modelos."""
```

`src/tcc_jobs/db/session.py`:

```python
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker


def criar_engine(url: str) -> Engine:
    return create_engine(url, pool_pre_ping=True, future=True)


def criar_sessionmaker(engine: Engine) -> sessionmaker[Session]:
    return sessionmaker(bind=engine, expire_on_commit=False)
```

- [ ] **Passo 4: Rodar e ver passar**

O PostgreSQL e o container `jobs` da Tarefa 1 precisam estar de pé.

```bash
docker compose exec jobs uv run pytest tests/test_session.py -v
```

Esperado: 3 passed. O host `postgres` resolve dentro da rede do compose - se der `could not translate host name`, o serviço não subiu: `docker compose up -d`.

- [ ] **Passo 5: Commit**

```bash
git add src/tcc_jobs/db tests/test_session.py
git commit -m "feat: base declarativa e fábrica de sessões"
```

---

## Tarefa 4: Modelos de dimensão

**Arquivos:**
- Criar: `tcc-jobs/src/tcc_jobs/db/models/__init__.py`
- Criar: `tcc-jobs/src/tcc_jobs/db/models/dimensoes.py`
- Teste: `tcc-jobs/tests/conftest.py`
- Teste: `tcc-jobs/tests/test_models_dimensoes.py`

**Interfaces:**
- Produz: `Orgao` (PK `codigo_orgao: str`), `UnidadeGestora` (PK `codigo_ug: str`, FK `codigo_orgao`), `Fornecedor` (PK `cnpj: str`). Todos importáveis de `tcc_jobs.db.models`.

- [ ] **Passo 1: Criar a fixture compartilhada**

Arquivo `tcc-jobs/tests/conftest.py`:

```python
from collections.abc import Iterator

import pytest
from sqlalchemy import Engine
from sqlalchemy.orm import Session

from tcc_jobs.core.config import settings
from tcc_jobs.db.base import Base
from tcc_jobs.db.session import criar_engine, criar_sessionmaker


@pytest.fixture(scope="session")
def engine() -> Engine:
    return criar_engine(settings.test_database_url)


@pytest.fixture
def sessao(engine: Engine) -> Iterator[Session]:
    """Recria o esquema a cada teste e desfaz tudo ao final."""
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    with criar_sessionmaker(engine)() as s:
        yield s
```

> A fixture importa `Base` depois dos modelos serem registrados. Por isso `models/__init__.py` precisa reexportar todos - senão `create_all` cria só parte das tabelas.

- [ ] **Passo 2: Escrever o teste que falha**

Arquivo `tcc-jobs/tests/test_models_dimensoes.py`:

```python
import pytest
from sqlalchemy.exc import IntegrityError

from tcc_jobs.db.models import Fornecedor, Orgao, UnidadeGestora


def test_persiste_orgao(sessao):
    sessao.add(Orgao(codigo_orgao="22000", nome="Ministério da Agricultura e Pecuária"))
    sessao.commit()

    orgao = sessao.get(Orgao, "22000")
    assert orgao is not None
    assert orgao.nome == "Ministério da Agricultura e Pecuária"


def test_unidade_gestora_referencia_orgao(sessao):
    sessao.add(Orgao(codigo_orgao="22000", nome="Ministério da Agricultura e Pecuária"))
    sessao.add(
        UnidadeGestora(
            codigo_ug="130094",
            nome="SUPERINT.DE AGRICULTURA E PECUARIA - SFA/PA",
            codigo_orgao="22000",
        )
    )
    sessao.commit()

    ug = sessao.get(UnidadeGestora, "130094")
    assert ug is not None
    assert ug.codigo_orgao == "22000"


def test_unidade_gestora_sem_orgao_falha(sessao):
    sessao.add(UnidadeGestora(codigo_ug="130094", nome="SFA/PA", codigo_orgao="99999"))
    with pytest.raises(IntegrityError):
        sessao.commit()


def test_fornecedor_usa_cnpj_como_chave(sessao):
    sessao.add(Fornecedor(cnpj="14986916000177", nome="CORDEL AUTOMACAO & SERVICOS LTDA"))
    sessao.commit()

    assert sessao.get(Fornecedor, "14986916000177").nome == "CORDEL AUTOMACAO & SERVICOS LTDA"
```

- [ ] **Passo 3: Rodar e ver falhar**

```bash
docker compose exec jobs uv run pytest tests/test_models_dimensoes.py -v
```

Esperado: FAIL com `ModuleNotFoundError: No module named 'tcc_jobs.db.models'`.

- [ ] **Passo 4: Implementar**

`src/tcc_jobs/db/models/dimensoes.py`:

```python
from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from tcc_jobs.db.base import Base


class Orgao(Base):
    """Órgão superior ou subordinado, conforme o código SIAFI."""

    __tablename__ = "orgao"

    codigo_orgao: Mapped[str] = mapped_column(String(10), primary_key=True)
    nome: Mapped[str] = mapped_column(String(255))
    codigo_orgao_superior: Mapped[str | None] = mapped_column(String(10))
    nome_orgao_superior: Mapped[str | None] = mapped_column(String(255))


class UnidadeGestora(Base):
    """Unidade gestora responsável pela licitação."""

    __tablename__ = "unidade_gestora"

    codigo_ug: Mapped[str] = mapped_column(String(10), primary_key=True)
    nome: Mapped[str] = mapped_column(String(255))
    codigo_orgao: Mapped[str] = mapped_column(ForeignKey("orgao.codigo_orgao"), index=True)


class Fornecedor(Base):
    """Participante de licitação, identificado pelo CNPJ."""

    __tablename__ = "fornecedor"

    cnpj: Mapped[str] = mapped_column(String(14), primary_key=True)
    nome: Mapped[str] = mapped_column(String(255))
```

`src/tcc_jobs/db/models/__init__.py`:

```python
from tcc_jobs.db.models.dimensoes import Fornecedor, Orgao, UnidadeGestora

__all__ = ["Fornecedor", "Orgao", "UnidadeGestora"]
```

- [ ] **Passo 5: Rodar e ver passar**

```bash
docker compose exec jobs uv run pytest tests/test_models_dimensoes.py -v
```

Esperado: 4 passed.

- [ ] **Passo 6: Commit**

```bash
git add src/tcc_jobs/db/models tests/conftest.py tests/test_models_dimensoes.py
git commit -m "feat: modelos de dimensão orgao, unidade_gestora e fornecedor"
```

---

## Tarefa 5: Modelos de fato e chave natural

**Arquivos:**
- Criar: `tcc-jobs/src/tcc_jobs/db/models/fatos.py`
- Modificar: `tcc-jobs/src/tcc_jobs/db/models/__init__.py`
- Teste: `tcc-jobs/tests/test_models_fatos.py`

**Interfaces:**
- Produz: `Licitacao` (PK `id: int`, única em `(numero_licitacao, codigo_ug, codigo_modalidade)`), `ItemLicitacao`, `ParticipanteLicitacao`.

Esta é a tarefa mais importante do plano: a restrição de unicidade é o que torna a ingestão idempotente.

- [ ] **Passo 1: Escrever o teste que falha**

Arquivo `tcc-jobs/tests/test_models_fatos.py`:

```python
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy.exc import IntegrityError

from tcc_jobs.db.models import (
    Fornecedor,
    ItemLicitacao,
    Licitacao,
    Orgao,
    ParticipanteLicitacao,
    UnidadeGestora,
)


@pytest.fixture
def base_minima(sessao):
    sessao.add(Orgao(codigo_orgao="22000", nome="Ministério da Agricultura e Pecuária"))
    sessao.add(UnidadeGestora(codigo_ug="130094", nome="SFA/PA", codigo_orgao="22000"))
    sessao.add(Fornecedor(cnpj="14986916000177", nome="CORDEL AUTOMACAO & SERVICOS LTDA"))
    sessao.commit()
    return sessao


def nova_licitacao(**kwargs) -> Licitacao:
    padrao = dict(
        numero_licitacao="000012023",
        codigo_ug="130094",
        codigo_modalidade=5,
        modalidade="Pregão",
        numero_processo="21030.002858/2023",
        objeto="Contratação de empresa de engenharia",
        situacao="Evento de Adiamento Publicado",
        uf="PA",
        municipio="BELEM",
        data_abertura=date(2023, 12, 26),
        data_resultado=date(2024, 1, 17),
        valor=Decimal("170612.0000"),
        competencia="202401",
    )
    return Licitacao(**{**padrao, **kwargs})


def test_persiste_licitacao(base_minima):
    base_minima.add(nova_licitacao())
    base_minima.commit()

    lic = base_minima.query(Licitacao).one()
    assert lic.id is not None
    assert lic.valor == Decimal("170612.0000")
    assert lic.data_abertura == date(2023, 12, 26)


def test_chave_natural_impede_duplicata(base_minima):
    base_minima.add(nova_licitacao())
    base_minima.commit()

    base_minima.add(nova_licitacao(competencia="202402", objeto="outro texto"))
    with pytest.raises(IntegrityError):
        base_minima.commit()


def test_mesma_ug_e_numero_com_modalidade_diferente_coexistem(base_minima):
    base_minima.add(nova_licitacao())
    base_minima.add(nova_licitacao(codigo_modalidade=8, modalidade="Dispensa"))
    base_minima.commit()

    assert base_minima.query(Licitacao).count() == 2


def test_item_e_participante_referenciam_licitacao(base_minima):
    lic = nova_licitacao()
    base_minima.add(lic)
    base_minima.commit()

    base_minima.add(
        ItemLicitacao(
            licitacao_id=lic.id,
            codigo_item_compra="1300940500001202300001",
            descricao="SERVICO ENGENHARIA",
            quantidade=Decimal("1"),
            valor_item=Decimal("99500.0000"),
            cnpj_vencedor="14986916000177",
        )
    )
    base_minima.add(
        ParticipanteLicitacao(
            licitacao_id=lic.id,
            codigo_item_compra="1300940500001202300001",
            cnpj_participante="14986916000177",
            flag_vencedor=False,
        )
    )
    base_minima.commit()

    assert base_minima.query(ItemLicitacao).one().valor_item == Decimal("99500.0000")
    assert base_minima.query(ParticipanteLicitacao).one().flag_vencedor is False
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
docker compose exec jobs uv run pytest tests/test_models_fatos.py -v
```

Esperado: FAIL com `ImportError: cannot import name 'Licitacao'`.

- [ ] **Passo 3: Implementar**

`src/tcc_jobs/db/models/fatos.py`:

```python
from datetime import date
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from tcc_jobs.db.base import Base


class Licitacao(Base):
    """Licitação do Poder Executivo Federal.

    A chave natural (numero_licitacao, codigo_ug, codigo_modalidade) é o que
    relaciona os três CSVs de origem entre si e o que torna a ingestão
    idempotente: a mesma competência pode ser reprocessada sem duplicar.
    """

    __tablename__ = "licitacao"
    __table_args__ = (
        UniqueConstraint(
            "numero_licitacao",
            "codigo_ug",
            "codigo_modalidade",
            name="uq_licitacao_chave_natural",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)

    numero_licitacao: Mapped[str] = mapped_column(String(20))
    codigo_ug: Mapped[str] = mapped_column(ForeignKey("unidade_gestora.codigo_ug"))
    codigo_modalidade: Mapped[int] = mapped_column(Integer, index=True)

    modalidade: Mapped[str] = mapped_column(String(100))
    numero_processo: Mapped[str | None] = mapped_column(String(50))
    objeto: Mapped[str | None] = mapped_column(Text)
    situacao: Mapped[str | None] = mapped_column(String(100))
    uf: Mapped[str | None] = mapped_column(String(2))
    municipio: Mapped[str | None] = mapped_column(String(100))

    data_abertura: Mapped[date | None] = mapped_column(Date, index=True)
    data_resultado: Mapped[date | None] = mapped_column(Date)
    valor: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))

    competencia: Mapped[str] = mapped_column(String(6), index=True)


class ItemLicitacao(Base):
    """Item licitado, com quantidade, valor e vencedor."""

    __tablename__ = "item_licitacao"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    licitacao_id: Mapped[int] = mapped_column(
        ForeignKey("licitacao.id", ondelete="CASCADE"), index=True
    )
    codigo_item_compra: Mapped[str] = mapped_column(String(30), index=True)
    descricao: Mapped[str | None] = mapped_column(Text)
    quantidade: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    valor_item: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    cnpj_vencedor: Mapped[str | None] = mapped_column(ForeignKey("fornecedor.cnpj"))


class ParticipanteLicitacao(Base):
    """Concorrente de um item, com indicação de vitória.

    É a tabela que habilita os atributos de competitividade usados na
    detecção de anomalias.
    """

    __tablename__ = "participante_licitacao"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    licitacao_id: Mapped[int] = mapped_column(
        ForeignKey("licitacao.id", ondelete="CASCADE"), index=True
    )
    codigo_item_compra: Mapped[str] = mapped_column(String(30))
    cnpj_participante: Mapped[str] = mapped_column(ForeignKey("fornecedor.cnpj"), index=True)
    flag_vencedor: Mapped[bool] = mapped_column(Boolean, default=False)
```

Atualizar `src/tcc_jobs/db/models/__init__.py`:

```python
from tcc_jobs.db.models.dimensoes import Fornecedor, Orgao, UnidadeGestora
from tcc_jobs.db.models.fatos import ItemLicitacao, Licitacao, ParticipanteLicitacao

__all__ = [
    "Fornecedor",
    "ItemLicitacao",
    "Licitacao",
    "Orgao",
    "ParticipanteLicitacao",
    "UnidadeGestora",
]
```

- [ ] **Passo 4: Rodar e ver passar**

```bash
docker compose exec jobs uv run pytest tests/test_models_fatos.py -v
```

Esperado: 4 passed.

- [ ] **Passo 5: Commit**

```bash
git add src/tcc_jobs/db/models tests/test_models_fatos.py
git commit -m "feat: modelos de fato com chave natural idempotente"
```

---

## Tarefa 6: Modelos operacional e analítico

**Arquivos:**
- Criar: `tcc-jobs/src/tcc_jobs/db/models/operacional.py`
- Criar: `tcc-jobs/src/tcc_jobs/db/models/analitico.py`
- Modificar: `tcc-jobs/src/tcc_jobs/db/models/__init__.py`
- Teste: `tcc-jobs/tests/test_models_analitico.py`

**Interfaces:**
- Produz: `IngestaoLog`; `SerieMensal`; `ExecucaoModelo`; `Previsao`; `ScoreAnomalia`.

- [ ] **Passo 1: Escrever o teste que falha**

Arquivo `tcc-jobs/tests/test_models_analitico.py`:

```python
from datetime import datetime
from decimal import Decimal

from tcc_jobs.db.models import ExecucaoModelo, IngestaoLog, Previsao, SerieMensal


def test_registra_log_de_ingestao(sessao):
    sessao.add(
        IngestaoLog(
            competencia="202401",
            arquivo="202401_Licitação.csv",
            linhas_lidas=2537,
            linhas_inseridas=2500,
            linhas_atualizadas=37,
            linhas_rejeitadas=0,
            iniciado_em=datetime(2026, 8, 2, 10, 0),
            finalizado_em=datetime(2026, 8, 2, 10, 2),
            status="sucesso",
        )
    )
    sessao.commit()

    log = sessao.query(IngestaoLog).one()
    assert log.linhas_lidas == 2537
    assert log.status == "sucesso"


def test_serie_mensal_agrega_por_orgao_e_modalidade(sessao):
    sessao.add(
        SerieMensal(
            competencia="202401",
            codigo_orgao="22000",
            codigo_modalidade=5,
            quantidade_licitacoes=120,
            valor_total=Decimal("4500000.0000"),
            valor_mediano=Decimal("32000.0000"),
        )
    )
    sessao.commit()

    assert sessao.query(SerieMensal).one().quantidade_licitacoes == 120


def test_previsao_referencia_execucao_e_guarda_intervalo(sessao):
    execucao = ExecucaoModelo(
        tipo="forecast",
        algoritmo="AutoARIMA",
        parametros_json={"season_length": 12},
        metricas_json={"mae": 12.5, "mae_baseline": 18.1},
        janela_treino_inicio="201301",
        janela_treino_fim="202312",
        executado_em=datetime(2026, 8, 2, 12, 0),
    )
    sessao.add(execucao)
    sessao.commit()

    sessao.add(
        Previsao(
            execucao_id=execucao.id,
            serie_chave="orgao:22000",
            competencia_alvo="202401",
            alvo="quantidade",
            valor_previsto=Decimal("118.0000"),
            ic_inferior=Decimal("101.0000"),
            ic_superior=Decimal("135.0000"),
        )
    )
    sessao.commit()

    prev = sessao.query(Previsao).one()
    assert prev.serie_chave == "orgao:22000"
    assert prev.ic_inferior < prev.valor_previsto < prev.ic_superior
    assert sessao.get(ExecucaoModelo, prev.execucao_id).metricas_json["mae"] == 12.5
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
docker compose exec jobs uv run pytest tests/test_models_analitico.py -v
```

Esperado: FAIL com `ImportError: cannot import name 'IngestaoLog'`.

- [ ] **Passo 3: Implementar o operacional**

`src/tcc_jobs/db/models/operacional.py`:

```python
from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from tcc_jobs.db.base import Base


class IngestaoLog(Base):
    """Registro de cada arquivo processado. Atende ao RF10."""

    __tablename__ = "ingestao_log"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    competencia: Mapped[str] = mapped_column(String(6), index=True)
    arquivo: Mapped[str] = mapped_column(String(255))

    linhas_lidas: Mapped[int] = mapped_column(Integer, default=0)
    linhas_inseridas: Mapped[int] = mapped_column(Integer, default=0)
    linhas_atualizadas: Mapped[int] = mapped_column(Integer, default=0)
    linhas_rejeitadas: Mapped[int] = mapped_column(Integer, default=0)

    iniciado_em: Mapped[datetime] = mapped_column(DateTime)
    finalizado_em: Mapped[datetime | None] = mapped_column(DateTime)
    status: Mapped[str] = mapped_column(String(20))
    mensagem_erro: Mapped[str | None] = mapped_column(Text)
```

- [ ] **Passo 4: Implementar o analítico**

`src/tcc_jobs/db/models/analitico.py`:

```python
from datetime import datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from tcc_jobs.db.base import Base


class SerieMensal(Base):
    """Agregado mensal que alimenta a previsão e a análise histórica."""

    __tablename__ = "serie_mensal"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    competencia: Mapped[str] = mapped_column(String(6), index=True)
    codigo_orgao: Mapped[str | None] = mapped_column(String(10), index=True)
    codigo_modalidade: Mapped[int | None] = mapped_column(Integer)
    quantidade_licitacoes: Mapped[int] = mapped_column(Integer, default=0)
    valor_total: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    valor_mediano: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))


class ExecucaoModelo(Base):
    """Uma rodada de treino ou scoring, com parâmetros e métricas.

    Persistir isto é o que permite comparar configurações na defesa, em vez
    de apresentar um número isolado sem procedência.
    """

    __tablename__ = "execucao_modelo"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    tipo: Mapped[str] = mapped_column(String(20), index=True)
    algoritmo: Mapped[str] = mapped_column(String(50))
    parametros_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    metricas_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    janela_treino_inicio: Mapped[str | None] = mapped_column(String(6))
    janela_treino_fim: Mapped[str | None] = mapped_column(String(6))
    executado_em: Mapped[datetime] = mapped_column(DateTime)


class Previsao(Base):
    """Previsão por série e competência, com intervalo de confiança."""

    __tablename__ = "previsao"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    execucao_id: Mapped[int] = mapped_column(
        ForeignKey("execucao_modelo.id", ondelete="CASCADE"), index=True
    )
    serie_chave: Mapped[str] = mapped_column(String(50), index=True)
    competencia_alvo: Mapped[str] = mapped_column(String(6), index=True)
    alvo: Mapped[str] = mapped_column(String(20))
    valor_previsto: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    ic_inferior: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))
    ic_superior: Mapped[Decimal | None] = mapped_column(Numeric(18, 4))


class ScoreAnomalia(Base):
    """Score de atipicidade por licitação.

    O vocabulário é deliberado: score e posição de ranking, nunca termos que
    sugiram irregularidade. O sistema aponta desvio estatístico, não fraude.
    """

    __tablename__ = "score_anomalia"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    execucao_id: Mapped[int] = mapped_column(
        ForeignKey("execucao_modelo.id", ondelete="CASCADE"), index=True
    )
    licitacao_id: Mapped[int] = mapped_column(
        ForeignKey("licitacao.id", ondelete="CASCADE"), index=True
    )
    score: Mapped[Decimal] = mapped_column(Numeric(12, 6), index=True)
    posicao_ranking: Mapped[int | None] = mapped_column(Integer)
    features_json: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
```

Atualizar `src/tcc_jobs/db/models/__init__.py`:

```python
from tcc_jobs.db.models.analitico import (
    ExecucaoModelo,
    Previsao,
    ScoreAnomalia,
    SerieMensal,
)
from tcc_jobs.db.models.dimensoes import Fornecedor, Orgao, UnidadeGestora
from tcc_jobs.db.models.fatos import ItemLicitacao, Licitacao, ParticipanteLicitacao
from tcc_jobs.db.models.operacional import IngestaoLog

__all__ = [
    "ExecucaoModelo",
    "Fornecedor",
    "IngestaoLog",
    "ItemLicitacao",
    "Licitacao",
    "Orgao",
    "ParticipanteLicitacao",
    "Previsao",
    "ScoreAnomalia",
    "SerieMensal",
]
```

- [ ] **Passo 5: Rodar e ver passar**

```bash
docker compose exec jobs uv run pytest tests/test_models_analitico.py -v
```

Esperado: 3 passed.

- [ ] **Passo 6: Rodar a suíte inteira**

```bash
docker compose exec jobs uv run pytest -v
```

Esperado: 16 passed.

- [ ] **Passo 7: Commit**

```bash
git add src/tcc_jobs/db/models tests/test_models_analitico.py
git commit -m "feat: modelos de log de ingestão e resultados de modelos"
```

---

## Tarefa 7: Alembic e primeira migration

**Arquivos:**
- Criar: `tcc-jobs/alembic.ini`
- Criar: `tcc-jobs/src/tcc_jobs/db/migrations/env.py`
- Criar: `tcc-jobs/src/tcc_jobs/db/migrations/script.py.mako`
- Criar: `tcc-jobs/src/tcc_jobs/db/migrations/versions/<hash>_esquema_inicial.py`
- Teste: `tcc-jobs/tests/test_migrations.py`

**Interfaces:**
- Produz: `alembic upgrade head` cria todas as 11 tabelas; `alembic downgrade base` remove todas.

- [ ] **Passo 1: Inicializar o Alembic**

```bash
docker compose exec jobs uv add --dev alembic
docker compose exec jobs uv run alembic init -t generic src/tcc_jobs/db/migrations
```

Isso cria `alembic.ini` na raiz e o diretório de migrations.

- [ ] **Passo 2: Apontar o Alembic para os modelos**

Em `alembic.ini`, ajustar a linha `script_location` e remover a URL fixa:

```ini
script_location = src/tcc_jobs/db/migrations
prepend_sys_path = src
```

Apagar a linha `sqlalchemy.url = ...` - a URL vem da configuração.

Substituir o topo de `src/tcc_jobs/db/migrations/env.py` (as linhas até `target_metadata`):

```python
from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from tcc_jobs.core.config import settings
from tcc_jobs.db.base import Base
from tcc_jobs.db import models  # noqa: F401  - registra as tabelas no metadata

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata
```

> O import de `models` parece não usado e o linter marca. Sem ele, o `Base.metadata` fica vazio e o autogenerate produz uma migration que não cria nada. Por isso o `# noqa: F401`.

- [ ] **Passo 3: Gerar a migration**

Com o compose de pé:

```bash
docker compose exec jobs uv run alembic revision --autogenerate -m "esquema inicial"
```

- [ ] **Passo 4: Conferir a migration gerada**

Abrir o arquivo em `src/tcc_jobs/db/migrations/versions/` e verificar que ele cria as 11 tabelas: `orgao`, `unidade_gestora`, `fornecedor`, `licitacao`, `item_licitacao`, `participante_licitacao`, `ingestao_log`, `serie_mensal`, `execucao_modelo`, `previsao`, `score_anomalia`.

Confirmar que a restrição `uq_licitacao_chave_natural` aparece, e que existem índices em `participante_licitacao.licitacao_id` e `participante_licitacao.cnpj_participante`. Sem esses índices, a carga de 21,8 milhões de linhas fica inviável.

- [ ] **Passo 5: Escrever o teste de ida e volta**

Arquivo `tcc-jobs/tests/test_migrations.py`:

```python
import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import inspect, text

from tcc_jobs.core.config import settings

TABELAS_ESPERADAS = {
    "orgao",
    "unidade_gestora",
    "fornecedor",
    "licitacao",
    "item_licitacao",
    "participante_licitacao",
    "ingestao_log",
    "serie_mensal",
    "execucao_modelo",
    "previsao",
    "score_anomalia",
}


def _config() -> Config:
    cfg = Config("alembic.ini")
    cfg.set_main_option("sqlalchemy.url", settings.test_database_url)
    return cfg


@pytest.fixture
def banco_limpo(engine):
    """Zera o schema, inclusive alembic_version.

    A fixture `sessao` usa Base.metadata.drop_all, que não conhece a tabela
    alembic_version. Sem esta limpeza, o Alembic acharia que a migration já
    está aplicada enquanto as tabelas não existem, e o downgrade quebraria.
    """
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
    return engine


def test_upgrade_cria_todas_as_tabelas(banco_limpo):
    command.upgrade(_config(), "head")

    tabelas = set(inspect(banco_limpo).get_table_names())
    assert TABELAS_ESPERADAS <= tabelas


def test_chave_natural_existe_apos_upgrade(banco_limpo):
    command.upgrade(_config(), "head")

    constraints = inspect(banco_limpo).get_unique_constraints("licitacao")
    nomes = {c["name"] for c in constraints}
    assert "uq_licitacao_chave_natural" in nomes


def test_indices_criticos_existem(banco_limpo):
    command.upgrade(_config(), "head")

    insp = inspect(banco_limpo)
    colunas_indexadas = {
        col
        for idx in insp.get_indexes("participante_licitacao")
        for col in idx["column_names"]
    }
    assert {"licitacao_id", "cnpj_participante"} <= colunas_indexadas


def test_downgrade_remove_tudo(banco_limpo):
    cfg = _config()
    command.upgrade(cfg, "head")
    command.downgrade(cfg, "base")

    tabelas = set(inspect(banco_limpo).get_table_names())
    assert not (TABELAS_ESPERADAS & tabelas)
```

- [ ] **Passo 6: Rodar o teste**

```bash
docker compose exec jobs uv run pytest tests/test_migrations.py -v
```

Esperado: 4 passed. Se `test_downgrade_remove_tudo` falhar, a migration gerada tem `downgrade()` incompleto - complete manualmente com os `op.drop_table()` na ordem inversa.

- [ ] **Passo 7: Aplicar no banco de desenvolvimento**

```bash
docker compose exec jobs uv run alembic upgrade head
docker compose exec postgres psql -U tcc -d tcc -c "\dt"
```

Esperado: 12 tabelas listadas (11 do domínio mais `alembic_version`).

- [ ] **Passo 8: Commit**

```bash
cd ~/dev/TCC/tcc-jobs
git add alembic.ini src/tcc_jobs/db/migrations tests/test_migrations.py pyproject.toml uv.lock
git commit -m "feat: migration inicial com esquema completo"
git push origin main
```

---

## Tarefa 8: CLI com os cinco comandos

**Arquivos:**
- Criar: `tcc-jobs/src/tcc_jobs/cli.py`
- Teste: `tcc-jobs/tests/test_cli.py`

**Interfaces:**
- Produz: `tcc_jobs.cli.app` (Typer) com `ingest`, `load`, `aggregate`, `train`, `score`. `ingest` e `load` aceitam `--de` e `--ate` no formato `AAAAMM`; `train` aceita `--serie`.

Os comandos ficam sem implementação nesta tarefa. O objetivo é fixar o contrato da interface e a validação de competência, que os planos seguintes consomem.

- [ ] **Passo 1: Escrever o teste que falha**

Arquivo `tcc-jobs/tests/test_cli.py`:

```python
import pytest
from typer.testing import CliRunner

from tcc_jobs.cli import app, validar_competencia

runner = CliRunner()


def test_ajuda_lista_os_cinco_comandos():
    resultado = runner.invoke(app, ["--help"])
    assert resultado.exit_code == 0
    for comando in ("ingest", "load", "aggregate", "train", "score"):
        assert comando in resultado.stdout


@pytest.mark.parametrize("valor", ["201301", "202404", "199912"])
def test_competencia_valida(valor):
    assert validar_competencia(valor) == valor


@pytest.mark.parametrize("valor", ["2013", "20130", "2013-01", "201313", "201300", "abcdef"])
def test_competencia_invalida(valor):
    with pytest.raises(ValueError, match="competência"):
        validar_competencia(valor)


def test_ingest_rejeita_competencia_malformada():
    resultado = runner.invoke(app, ["ingest", "--de", "2013", "--ate", "202404"])
    assert resultado.exit_code != 0


def test_ingest_rejeita_intervalo_invertido():
    resultado = runner.invoke(app, ["ingest", "--de", "202404", "--ate", "201301"])
    assert resultado.exit_code != 0
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
docker compose exec jobs uv run pytest tests/test_cli.py -v
```

Esperado: FAIL com `ModuleNotFoundError: No module named 'tcc_jobs.cli'`.

- [ ] **Passo 3: Implementar**

`src/tcc_jobs/cli.py`:

```python
import re

import typer

app = typer.Typer(help="Jobs de dados e modelos do TCC de licitações.")

PADRAO_COMPETENCIA = re.compile(r"^\d{4}(0[1-9]|1[0-2])$")


def validar_competencia(valor: str) -> str:
    """Valida competência no formato AAAAMM."""
    if not PADRAO_COMPETENCIA.match(valor):
        raise ValueError(f"competência inválida: {valor!r}. Use o formato AAAAMM, ex: 202401")
    return valor


def _validar_intervalo(de: str, ate: str) -> tuple[str, str]:
    validar_competencia(de)
    validar_competencia(ate)
    if de > ate:
        raise typer.BadParameter(f"intervalo invertido: {de} é posterior a {ate}")
    return de, ate


@app.command()
def ingest(
    de: str = typer.Option(..., help="Competência inicial, AAAAMM"),
    ate: str = typer.Option(..., help="Competência final, AAAAMM"),
) -> None:
    """Baixa os ZIPs e grava Parquet limpo em silver."""
    try:
        de, ate = _validar_intervalo(de, ate)
    except ValueError as erro:
        raise typer.BadParameter(str(erro)) from erro
    typer.echo(f"ingest {de}..{ate} - ainda não implementado")


@app.command()
def load(
    de: str = typer.Option(..., help="Competência inicial, AAAAMM"),
    ate: str = typer.Option(..., help="Competência final, AAAAMM"),
) -> None:
    """Carrega silver no PostgreSQL via COPY."""
    try:
        de, ate = _validar_intervalo(de, ate)
    except ValueError as erro:
        raise typer.BadParameter(str(erro)) from erro
    typer.echo(f"load {de}..{ate} - ainda não implementado")


@app.command()
def aggregate() -> None:
    """Monta serie_mensal e a matriz de atributos."""
    typer.echo("aggregate - ainda não implementado")


@app.command()
def train(serie: str = typer.Option("orgao", help="Agrupamento: orgao, modalidade ou global")) -> None:
    """Treina os modelos de previsão e grava previsao."""
    typer.echo(f"train --serie {serie} - ainda não implementado")


@app.command()
def score() -> None:
    """Calcula scores de atipicidade e grava score_anomalia."""
    typer.echo("score - ainda não implementado")


if __name__ == "__main__":
    app()
```

- [ ] **Passo 4: Rodar e ver passar**

```bash
docker compose exec jobs uv run pytest tests/test_cli.py -v
```

Esperado: 12 passed.

- [ ] **Passo 5: Verificar o comando instalado**

```bash
docker compose exec jobs uv run tcc --help
docker compose exec jobs uv run tcc ingest --de 201301 --ate 202404
```

Esperado: ajuda com os cinco comandos, e a mensagem `ingest 201301..202404 - ainda não implementado`.

- [ ] **Passo 6: Commit**

```bash
git add src/tcc_jobs/cli.py tests/test_cli.py
git commit -m "feat: cli com os cinco comandos e validação de competência"
git push origin main
```

---

## Tarefa 9: Esqueleto da API em Laravel

**Arquivos:**
- Criar: estrutura Laravel em `tcc-api/`
- Criar: `tcc-api/Dockerfile`
- Modificar: `tcc-infra/docker-compose.yml`
- Criar: `tcc-api/routes/api.php`
- Teste: `tcc-api/tests/Feature/HealthTest.php`

**Interfaces:**
- Produz: `GET /api/health` devolvendo `{"status":"ok","database":"ok"}` com HTTP 200.

- [ ] **Passo 1: Criar o projeto pelo container**

Nada de PHP no host. O `composer create-project` exige diretório vazio, e o repositório já tem `README.md` e `.gitignore` - por isso o projeto nasce numa subpasta e é mesclado:

```bash
cd ~/dev/TCC/tcc-api
docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$PWD":/app -w /app composer:2 \
  create-project laravel/laravel .laravel-tmp --no-interaction
cp -rn .laravel-tmp/. . && rm -rf .laravel-tmp
```

`-u "$(id -u):$(id -g)"` faz os arquivos nascerem com o seu usuário. Sem isso, viriam como root e você não conseguiria editá-los.

- [ ] **Passo 2: Dockerfile multi-stage**

Arquivo `tcc-api/Dockerfile`:

```dockerfile
FROM php:8.3-cli-alpine AS base

RUN apk add --no-cache postgresql-dev \
    && docker-php-ext-install pdo pdo_pgsql

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
WORKDIR /app

# --- desenvolvimento: código por bind mount ---
FROM base AS dev
CMD ["php", "artisan", "serve", "--host=0.0.0.0", "--port=8000"]

# --- produção: código embutido, sem dependências de desenvolvimento ---
FROM base AS prod
COPY composer.json composer.lock ./
RUN composer install --no-dev --no-scripts --no-autoloader --prefer-dist
COPY . .
RUN composer dump-autoload --optimize
EXPOSE 8000
CMD ["php", "artisan", "serve", "--host=0.0.0.0", "--port=8000"]
```

A extensão `pdo_pgsql` é obrigatória. Sem ela o Laravel falha com `could not find driver`, mensagem que não indica a causa.

- [ ] **Passo 3: Adicionar o serviço ao compose**

Em `tcc-infra/docker-compose.yml`, acrescentar dentro de `services:`:

```yaml
  api:
    build:
      context: ../tcc-api
      target: dev
    container_name: tcc-api
    volumes:
      - ../tcc-api:/app
      - api-vendor:/app/vendor
    environment:
      DB_CONNECTION: pgsql
      DB_HOST: postgres
      DB_PORT: 5432
      DB_DATABASE: ${POSTGRES_DB}
      DB_USERNAME: ${POSTGRES_USER}
      DB_PASSWORD: ${POSTGRES_PASSWORD}
      APP_ENV: local
      APP_DEBUG: "true"
    ports:
      - "8000:8000"
    depends_on:
      postgres:
        condition: service_healthy
```

E em `volumes:`, acrescentar `api-vendor:`.

O `vendor/` é volume nomeado, não bind mount: as dependências pertencem ao container. Sem isso, o `vendor` do host (que não existe) sobrescreveria o do container, e nada funcionaria.

- [ ] **Passo 4: Subir e instalar as dependências**

```bash
docker compose up -d --build api
docker compose exec api composer install
docker compose exec api php artisan key:generate
```

- [ ] **Passo 5: Configurar o `.env.example`**

Em `tcc-api/.env.example`, ajustar as chaves de banco (sem valores reais):

```bash
DB_CONNECTION=pgsql
DB_HOST=postgres
DB_PORT=5432
DB_DATABASE=tcc
DB_USERNAME=tcc
DB_PASSWORD=
```

O host é `postgres`, nome do serviço na rede do compose - não `127.0.0.1`.

- [ ] **Passo 6: Desabilitar as migrations do Laravel**

O Alembic é o dono do esquema. Remover as migrations padrão para que ninguém as rode por engano:

```bash
rm -f ~/dev/TCC/tcc-api/database/migrations/*.php
```

Criar `tcc-api/database/migrations/README.md`:

```markdown
# Sem migrations aqui

O esquema deste banco é definido e versionado por Alembic, no repositório
`tcc-jobs`. Não criar migrations neste diretório: duas ferramentas
versionando o mesmo banco entram em conflito, cada uma com sua tabela de
controle.
```

- [ ] **Passo 7: Escrever o teste que falha**

Arquivo `tcc-api/tests/Feature/HealthTest.php`:

```php
<?php

namespace Tests\Feature;

use Tests\TestCase;

class HealthTest extends TestCase
{
    public function test_health_responde_ok(): void
    {
        $resposta = $this->getJson('/api/health');

        $resposta->assertStatus(200)
            ->assertJson(['status' => 'ok']);
    }

    public function test_health_confirma_conexao_com_o_banco(): void
    {
        $resposta = $this->getJson('/api/health');

        $resposta->assertStatus(200)
            ->assertJson(['database' => 'ok']);
    }
}
```

- [ ] **Passo 8: Rodar e ver falhar**

```bash
docker compose exec api ./vendor/bin/phpunit tests/Feature/HealthTest.php
```

Esperado: FAIL com 404 - a rota não existe.

- [ ] **Passo 9: Implementar a rota**

Criar `tcc-api/routes/api.php`:

```php
<?php

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;

Route::get('/health', function () {
    try {
        DB::connection()->getPdo();
        $banco = 'ok';
    } catch (\Throwable $erro) {
        $banco = 'erro';
    }

    return response()->json([
        'status' => 'ok',
        'database' => $banco,
    ]);
});
```

Registrar o arquivo em `bootstrap/app.php`, no `withRouting`:

```php
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
```

- [ ] **Passo 10: Rodar e ver passar**

```bash
docker compose restart api
docker compose exec api ./vendor/bin/phpunit tests/Feature/HealthTest.php
```

Esperado: 2 passed.

- [ ] **Passo 11: Verificar do host**

```bash
curl -s http://localhost:8000/api/health
```

Esperado: `{"status":"ok","database":"ok"}`.

- [ ] **Passo 12: Commit**

```bash
docker compose exec api ./vendor/bin/pint
cd ~/dev/TCC/tcc-api
git add -A
git commit -m "feat: esqueleto laravel com endpoint de health"
git push origin main

cd ~/dev/TCC/tcc-infra
git add docker-compose.yml
git commit -m "feat: serviço api no compose"
git push origin main
```

---

## Tarefa 10: Esqueleto do dashboard em Angular

**Arquivos:**
- Criar: estrutura Angular em `tcc-frontend/`
- Criar: `tcc-frontend/Dockerfile`
- Modificar: `tcc-infra/docker-compose.yml`
- Criar: `tcc-frontend/src/app/core/health.service.ts`
- Teste: `tcc-frontend/src/app/core/health.service.spec.ts`

**Interfaces:**
- Produz: `HealthService.check(): Observable<HealthStatus>`, consumindo `GET {apiUrl}/health`.

- [ ] **Passo 1: Criar o projeto pelo container**

```bash
cd ~/dev/TCC/tcc-frontend
docker run --rm -u "$(id -u):$(id -g)" -e HOME=/tmp \
  -v "$PWD":/app -w /app node:22-alpine \
  npx -y @angular/cli@latest new tmp \
    --style=scss --ssr=false --routing=true --skip-git --package-manager=npm
cp -rn tmp/. . && rm -rf tmp
```

- [ ] **Passo 2: Dockerfile multi-stage**

Arquivo `tcc-frontend/Dockerfile`:

```dockerfile
# --- desenvolvimento: código por bind mount, ng serve com hot reload ---
FROM node:22-alpine AS dev
WORKDIR /app
CMD ["npm", "start", "--", "--host", "0.0.0.0", "--poll", "1000"]

# --- build de produção ---
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- produção: estático servido por nginx ---
FROM nginx:alpine AS prod
COPY --from=build /app/dist/tcc-frontend/browser /usr/share/nginx/html
EXPOSE 80
```

`--poll 1000` é necessário: a notificação de mudança de arquivo do inotify não atravessa de forma confiável o limite entre WSL e container, e sem polling o hot reload não dispara.

O caminho `dist/tcc-frontend/browser` varia conforme a versão do Angular CLI. Confirme com `docker compose exec frontend ls dist/` depois do primeiro build e ajuste se necessário.

- [ ] **Passo 3: Adicionar o serviço ao compose**

Em `tcc-infra/docker-compose.yml`, dentro de `services:`:

```yaml
  frontend:
    build:
      context: ../tcc-frontend
      target: dev
    container_name: tcc-frontend
    volumes:
      - ../tcc-frontend:/app
      - frontend-modules:/app/node_modules
    ports:
      - "4200:4200"
    depends_on:
      - api
```

E em `volumes:`, acrescentar `frontend-modules:`.

- [ ] **Passo 4: Subir e instalar**

```bash
docker compose up -d --build frontend
docker compose exec frontend npm install
```

- [ ] **Passo 5: Configurar a URL da API**

Criar `src/environments/environment.ts`:

```typescript
export const environment = {
  production: false,
  apiUrl: 'http://localhost:8000/api',
};
```

Aqui o host é `localhost`, não `api`: quem faz a requisição é o navegador na sua máquina, não o container do frontend.

- [ ] **Passo 6: Escrever o teste que falha**

Arquivo `src/app/core/health.service.spec.ts`:

```typescript
import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

import { HealthService } from './health.service';
import { environment } from '../../environments/environment';

describe('HealthService', () => {
  let service: HealthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [HealthService, provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(HealthService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('consulta o endpoint de health da API', () => {
    let recebido: { status: string; database: string } | undefined;

    service.check().subscribe((r) => (recebido = r));

    const req = http.expectOne(`${environment.apiUrl}/health`);
    expect(req.request.method).toBe('GET');
    req.flush({ status: 'ok', database: 'ok' });

    expect(recebido).toEqual({ status: 'ok', database: 'ok' });
  });
});
```

- [ ] **Passo 7: Rodar e ver falhar**

```bash
docker compose exec frontend npm test -- --watch=false --browsers=ChromeHeadless
```

Esperado: erro de compilação - `health.service` não existe.

> Se falhar por falta de Chrome no container, acrescente ao estágio `dev` do Dockerfile: `RUN apk add --no-cache chromium` e `ENV CHROME_BIN=/usr/bin/chromium-browser`, depois `docker compose up -d --build frontend`.

- [ ] **Passo 8: Implementar**

Arquivo `src/app/core/health.service.ts`:

```typescript
import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';

export interface HealthStatus {
  status: string;
  database: string;
}

@Injectable({ providedIn: 'root' })
export class HealthService {
  private readonly http = inject(HttpClient);

  check(): Observable<HealthStatus> {
    return this.http.get<HealthStatus>(`${environment.apiUrl}/health`);
  }
}
```

Registrar o `HttpClient` em `src/app/app.config.ts`:

```typescript
import { provideHttpClient } from '@angular/common/http';

export const appConfig: ApplicationConfig = {
  providers: [provideRouter(routes), provideHttpClient()],
};
```

- [ ] **Passo 9: Rodar e ver passar**

```bash
docker compose exec frontend npm test -- --watch=false --browsers=ChromeHeadless
```

Esperado: specs passando, incluindo o do HealthService.

- [ ] **Passo 10: Verificar o dashboard no navegador**

```bash
curl -s -o /dev/null -w "frontend HTTP:%{http_code}\n" http://localhost:4200
```

Esperado: HTTP 200. Abra `http://localhost:4200` e confirme que a página do Angular carrega.

- [ ] **Passo 11: Commit**

```bash
cd ~/dev/TCC/tcc-frontend
git add -A
git commit -m "feat: esqueleto angular com serviço de health"
git push origin main

cd ~/dev/TCC/tcc-infra
git add docker-compose.yml
git commit -m "feat: serviço frontend no compose"
git push origin main
```

---

## Tarefa 11: Atalhos e verificação fim a fim

**Arquivos:**
- Criar: `tcc-infra/Makefile`

**Interfaces:**
- Produz: `make dev`, `make test`, `make shell-jobs` e demais atalhos, operando sobre os cinco repositórios.

- [ ] **Passo 1: Criar o Makefile**

Arquivo `tcc-infra/Makefile`:

```makefile
.DEFAULT_GOAL := help
.PHONY: help up down logs ps rebuild test test-jobs test-api test-front lint shell-jobs shell-api migrate

help:  ## lista os alvos disponíveis
	@grep -E '^[a-z-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

up:  ## sobe todos os serviços
	docker compose up -d --build

down:  ## derruba os serviços, preservando o banco
	docker compose down

logs:  ## acompanha os logs de todos os serviços
	docker compose logs -f

ps:  ## estado dos serviços
	docker compose ps

test: test-jobs test-api test-front  ## suíte dos três repositórios

test-jobs:  ## pytest no container de jobs
	docker compose exec jobs uv run pytest -v

test-api:  ## phpunit no container da api
	docker compose exec api ./vendor/bin/phpunit

test-front:  ## specs do dashboard
	docker compose exec frontend npm test -- --watch=false --browsers=ChromeHeadless

lint:  ## lint das três stacks
	docker compose exec jobs uv run ruff check .
	docker compose exec api ./vendor/bin/pint --test
	docker compose exec frontend npm run lint

migrate:  ## aplica as migrations
	docker compose exec jobs uv run alembic upgrade head

shell-jobs:  ## shell no container de jobs
	docker compose exec jobs bash

shell-api:  ## shell no container da api
	docker compose exec api sh
```

Os alvos resolvem o atrito real do polyrepo: um comando atravessando os cinco repositórios, sem `cd` manual.

- [ ] **Passo 2: Verificar os atalhos**

```bash
cd ~/dev/TCC/tcc-infra
make help
make ps
```

Esperado: lista de alvos com descrição, e três serviços em execução.

- [ ] **Passo 3: Verificação fim a fim**

```bash
make up
sleep 15
curl -s http://localhost:8000/api/health
curl -s -o /dev/null -w "\nfrontend HTTP:%{http_code}\n" http://localhost:4200
docker compose exec postgres psql -U tcc -d tcc -c "\dt" | grep -c licitacao
```

Esperado: `{"status":"ok","database":"ok"}`, `frontend HTTP:200`, e `3` (as tabelas `licitacao`, `item_licitacao` e `participante_licitacao`).

- [ ] **Passo 4: Verificar a suíte completa**

```bash
make test
```

Esperado: 32 testes no `jobs`, 2 no `api`, specs do `frontend` - todos passando.

- [ ] **Passo 5: Verificar que o build de produção também funciona**

Os estágios `prod` não são exercitados pelo compose de desenvolvimento. Confirme que compilam:

```bash
docker build --target prod -t tcc-jobs:prod ~/dev/TCC/tcc-jobs
docker build --target prod -t tcc-api:prod ~/dev/TCC/tcc-api
docker build --target prod -t tcc-frontend:prod ~/dev/TCC/tcc-frontend
```

Esperado: três builds bem-sucedidos. Um estágio `prod` que nunca foi construído é um estágio quebrado esperando a véspera da entrega.

- [ ] **Passo 6: Commit**

```bash
cd ~/dev/TCC/tcc-infra
git add Makefile
git commit -m "feat: makefile com atalhos para os cinco repositórios"
git push origin main
```

---

## Tarefa 12: Integração contínua

**Arquivos:**
- Criar: `tcc-jobs/.github/workflows/ci.yml`
- Criar: `tcc-api/.github/workflows/ci.yml`
- Criar: `tcc-frontend/.github/workflows/ci.yml`

**Interfaces:**
- Produz: CI verde nos três repositórios a cada push.

- [ ] **Passo 1: CI dos jobs**

Arquivo `tcc-jobs/.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: tcc
          POSTGRES_USER: tcc
          POSTGRES_PASSWORD: tcc
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10

    env:
      DATABASE_URL: postgresql+psycopg://tcc:tcc@localhost:5432/tcc
      TEST_DATABASE_URL: postgresql+psycopg://tcc:tcc@localhost:5432/tcc_test

    steps:
      - uses: actions/checkout@v4

      - name: Criar banco de teste
        run: PGPASSWORD=tcc psql -h localhost -U tcc -d tcc -c "CREATE DATABASE tcc_test;"

      - uses: astral-sh/setup-uv@v5
        with:
          enable-cache: true

      - run: uv sync --all-extras --dev
      - run: uv run ruff check .
      - run: uv run ruff format --check .
      - run: uv run pytest -v
```

> O serviço do Postgres cria só um banco. O passo explícito de `CREATE DATABASE` substitui o script de init do compose, que não roda aqui.

- [ ] **Passo 2: CI da API**

Arquivo `tcc-api/.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_DB: tcc
          POSTGRES_USER: tcc
          POSTGRES_PASSWORD: tcc
        ports: ["5432:5432"]
        options: >-
          --health-cmd pg_isready
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10

    steps:
      - uses: actions/checkout@v4

      - uses: shivammathur/setup-php@v2
        with:
          php-version: '8.3'
          extensions: pdo, pdo_pgsql, mbstring, xml

      - run: composer install --prefer-dist --no-progress

      - name: Preparar ambiente
        run: |
          cp .env.example .env
          php artisan key:generate

      - run: ./vendor/bin/pint --test
      - run: ./vendor/bin/phpunit
        env:
          DB_CONNECTION: pgsql
          DB_HOST: 127.0.0.1
          DB_PORT: 5432
          DB_DATABASE: tcc
          DB_USERNAME: tcc
          DB_PASSWORD: tcc
```

- [ ] **Passo 3: CI do frontend**

Arquivo `tcc-frontend/.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  test:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: npm

      - run: npm ci
      - run: npm run lint
      - run: npm test -- --watch=false --browsers=ChromeHeadless
      - run: npm run build
```

- [ ] **Passo 4: Commit e verificação**

```bash
cd tcc-jobs && git add .github && git commit -m "ci: testes com postgres de serviço" && git push origin main
cd ../tcc-api && git add .github && git commit -m "ci: testes com postgres de serviço" && git push origin main
cd ../tcc-frontend && git add .github && git commit -m "ci: lint, testes e build" && git push origin main
```

- [ ] **Passo 5: Conferir os três**

```bash
for r in tcc-jobs tcc-api tcc-frontend; do
  echo "== $r"; gh run list --repo ddank0/$r --limit 1
done
```

Esperado: `completed success` nos três. Se algum falhar, o log sai em `gh run view --repo ddank0/<repo> --log-failed`.

---

## Critério de conclusão

Verificado por comando, não por impressão:

- [ ] `make up` sobe três serviços; `make ps` mostra `postgres` com `healthy`
- [ ] `curl localhost:8000/api/health` devolve `{"status":"ok","database":"ok"}`
- [ ] `curl localhost:4200` devolve HTTP 200
- [ ] `make test` passa: 32 testes no `jobs`, 2 no `api`, specs do `frontend`
- [ ] `make lint` sem erro nas três stacks
- [ ] `docker compose exec jobs uv run alembic downgrade base` e `upgrade head` funcionam nos dois sentidos
- [ ] Os três estágios `prod` compilam (`docker build --target prod`)
- [ ] CI verde nos três repositórios
- [ ] Nada indevido versionado: `git ls-files | grep -E 'AI_CONTEXT|\.env$|vendor/|node_modules/'` vazio nos cinco repositórios
- [ ] O host tem apenas Docker instalado - nenhum PHP, Composer ou dependência de projeto fora dos containers

## Próximo plano

Com a fundação de pé, segue o **Plano 02 - ETL** (semanas 3-5): download das 135 competências, parsers com as armadilhas de formato documentadas em [[Licitações - Pipeline de Dados]], camada medalhão em Parquet e carga via `COPY`.
