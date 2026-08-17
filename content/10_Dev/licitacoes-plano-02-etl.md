---
title: "Licitações - Plano 02 - ETL"
type: note
tags: [tcc, licitacoes, plano, etl, polars, parquet]
created: "2026-08-03"
status: ready
---

> **Para execução assistida:** use `superpowers:subagent-driven-development` ou `superpowers:executing-plans`. Os passos usam checkbox (`- [ ]`) para acompanhamento.

**Objetivo:** carregar as 136 competências (`201301`-`202404`) do Portal da Transparência no PostgreSQL, passando por camada intermediária em Parquet, com ingestão idempotente e registro de log.

**Arquitetura:** Functional Core, Imperative Shell - ver [[Licitações - Arquitetura dos Jobs]]. Parsers e transformações são funções puras que recebem `bytes` e devolvem `DataFrame`; download, escrita em disco e `COPY` ficam na casca.

**Stack:** Polars 1.43, httpx, psycopg3 com `COPY`, Parquet.

**Cobre:** semanas 3-5. RF01, RF02, RF03, RF10.

Contexto em [[Licitações - Pipeline de Dados]], [[Licitações - Fontes de Dados Públicos]] e [[Licitações - Modelo de Dados]].

---

## Restrições globais

- **Identidade git:** `Gabriel Miranda <isporck0@gmail.com>`, sem trailer de co-autoria.
- **Hífen simples** (`-`) em todo texto, inclusive intervalos.
- **Nenhum laço Python sobre registros.** Tudo vetorizado em Polars.
- **Carga em massa com `COPY`, nunca ORM.** ORM só para dimensões.
- **O núcleo não importa `db/` nem `portal/`.** Cada módulo novo do núcleo entra no `.importlinter` na mesma tarefa que o cria.
- **Nomenclatura proibida:** nunca `suspeita`, `irregularidade`, `fraude` ou equivalente.
- Identificadores em inglês; comentários e commits em português.
- `data/` nunca é versionado.

## Orçamento desta fase

| Operação | Alvo |
|---|---|
| `ingest` das 136 competências | < 30 min |
| `load` completo | < 15 min |
| `aggregate` | < 5 min |
| Total (`ingest` + `load`) | **< 45 min** |

---

## Verificações feitas antes de escrever este plano

Testadas contra a competência `202401` real, não presumidas:

**O Polars não lê os CSVs diretamente.** Ele aceita apenas `utf8` e `utf8-lossy`; não existe opção `latin-1`. E o `utf8-lossy` corrompe **até o nome das colunas**:

```
utf8-lossy:  'Nome �rg�o Superior'  /  'Minist�rio da Agricultura e Pecu�ria'
latin-1:     'Nome Órgão Superior'  /  'Ministério da Agricultura e Pecuária'
```

A decodificação tem que acontecer **antes** de o Polars ver os bytes.

**Não há separador de milhar.** O maior valor observado é `10665589,3300` - a conversão é apenas vírgula por ponto, sem remover pontos.

**16% das datas de abertura vêm vazias** - 411 de 2537. `data_abertura` é nullable no modelo, e o parser precisa de `strict=False`.

**Desempenho do parsing:** 164 mil linhas em 0,22s. Extrapolando para 136 competências, ~30s de CPU em parsing - o gargalo será a rede no download e o `COPY` na carga, não a transformação.

---

## Tarefa 1: Tipo de valor Competencia

**Arquivos:**
- Criar: `src/tcc_jobs/core/competencia.py`
- Modificar: `src/tcc_jobs/cli.py`
- Modificar: `.importlinter`
- Teste: `tests/test_competencia.py`

**Interfaces:**
- Produz: `Competencia` (frozen dataclass) com `ano: int`, `mes: int`; `Competencia.de_str(valor: str) -> Competencia`; `__str__` devolve `AAAAMM`; `Competencia.intervalo(de: Competencia, ate: Competencia) -> list[Competencia]`.

Substitui a validação por regex que hoje vive na CLI. Competência é conceito de domínio usado por todos os jobs, e como tipo evita passar `str` solto por dez funções.

- [ ] **Passo 1: Escrever o teste que falha**

Arquivo `tests/test_competencia.py`:

```python
import pytest

from tcc_jobs.core.competencia import Competencia


def test_cria_de_string() -> None:
    c = Competencia.de_str("202401")
    assert c.ano == 2024
    assert c.mes == 1
    assert str(c) == "202401"


@pytest.mark.parametrize("valor", ["2013", "20130", "2013-01", "201313", "201300", "abcdef", ""])
def test_rejeita_formato_invalido(valor: str) -> None:
    with pytest.raises(ValueError, match="competência"):
        Competencia.de_str(valor)


def test_ordenacao_permite_comparar() -> None:
    assert Competencia.de_str("201312") < Competencia.de_str("201401")
    assert Competencia.de_str("202404") > Competencia.de_str("201301")


def test_intervalo_atravessa_o_ano() -> None:
    janela = Competencia.intervalo(Competencia.de_str("201311"), Competencia.de_str("201402"))
    assert [str(c) for c in janela] == ["201311", "201312", "201401", "201402"]


def test_intervalo_de_um_mes() -> None:
    c = Competencia.de_str("202401")
    assert Competencia.intervalo(c, c) == [c]


def test_intervalo_invertido_falha() -> None:
    with pytest.raises(ValueError, match="invertido"):
        Competencia.intervalo(Competencia.de_str("202404"), Competencia.de_str("201301"))


def test_janela_completa_tem_135_competencias() -> None:
    """201301 a 202404 é a janela disponível na fonte."""
    janela = Competencia.intervalo(Competencia.de_str("201301"), Competencia.de_str("202404"))
    assert len(janela) == 136
```

> A última asserção usa 136, não 135: de jan/2013 a abr/2024 são 11 anos completos (132 meses) mais jan a abr de 2024 (4), totalizando 136. O número 135 citado na documentação era aproximação - este teste fixa o valor correto.

- [ ] **Passo 2: Rodar e ver falhar**

```bash
docker compose exec jobs uv run pytest tests/test_competencia.py -q
```

Esperado: `ModuleNotFoundError: No module named 'tcc_jobs.core.competencia'`.

- [ ] **Passo 3: Implementar**

Arquivo `src/tcc_jobs/core/competencia.py`:

```python
import re
from dataclasses import dataclass
from typing import Self

PADRAO = re.compile(r"^(\d{4})(0[1-9]|1[0-2])$")


@dataclass(frozen=True, order=True)
class Competencia:
    """Mês de referência dos dados, no formato AAAAMM.

    Tipo de valor imutável e ordenável: comparação e intervalo saem de graça,
    e o formato é validado uma única vez, na fronteira.
    """

    ano: int
    mes: int

    @classmethod
    def de_str(cls, valor: str) -> Self:
        casamento = PADRAO.match(valor)
        if casamento is None:
            raise ValueError(f"competência inválida: {valor!r}. Use o formato AAAAMM, ex: 202401")
        return cls(ano=int(casamento.group(1)), mes=int(casamento.group(2)))

    def __str__(self) -> str:
        return f"{self.ano:04d}{self.mes:02d}"

    def proxima(self) -> "Competencia":
        return Competencia(self.ano + 1, 1) if self.mes == 12 else Competencia(self.ano, self.mes + 1)

    @staticmethod
    def intervalo(de: "Competencia", ate: "Competencia") -> list["Competencia"]:
        if de > ate:
            raise ValueError(f"intervalo invertido: {de} é posterior a {ate}")
        janela = [de]
        while janela[-1] < ate:
            janela.append(janela[-1].proxima())
        return janela
```

- [ ] **Passo 4: Rodar e ver passar**

```bash
docker compose exec jobs uv run pytest tests/test_competencia.py -q
```

Esperado: 12 passed.

- [ ] **Passo 5: Usar o tipo na CLI**

Em `src/tcc_jobs/cli.py`, substituir `validar_competencia` e `_validar_intervalo` por:

```python
import typer

from tcc_jobs.core.competencia import Competencia

app = typer.Typer(help="Jobs de dados e modelos do TCC de licitações.")


def _intervalo(de: str, ate: str) -> list[Competencia]:
    """Converte e valida o intervalo, traduzindo o erro para a CLI."""
    try:
        return Competencia.intervalo(Competencia.de_str(de), Competencia.de_str(ate))
    except ValueError as erro:
        raise typer.BadParameter(str(erro)) from erro
```

E em `ingest` e `load`, trocar a chamada:

```python
@app.command()
def ingest(
    de: str = typer.Option(..., help="Competência inicial, AAAAMM"),
    ate: str = typer.Option(..., help="Competência final, AAAAMM"),
) -> None:
    """Baixa os ZIPs e grava Parquet limpo em silver."""
    competencias = _intervalo(de, ate)
    typer.echo(f"ingest {competencias[0]}..{competencias[-1]} - ainda não implementado")
```

- [ ] **Passo 6: Ajustar o teste da CLI**

Em `tests/test_cli.py`, remover os testes de `validar_competencia` (agora cobertos por `test_competencia.py`) e o import correspondente. Manter os que exercitam a CLI:

```python
from tcc_jobs.cli import app
```

- [ ] **Passo 7: Suíte e contratos**

```bash
docker compose exec jobs uv run pytest -q
docker compose exec jobs uv run lint-imports
docker compose exec jobs uv run ruff check . && docker compose exec jobs uv run pyright
```

Esperado: tudo verde. `core` continua sem importar infraestrutura.

- [ ] **Passo 8: Commit**

```bash
git add src/tcc_jobs/core/competencia.py src/tcc_jobs/cli.py tests/
git commit -m "feat: tipo de valor Competencia

Competência é conceito de domínio usado por todos os jobs. Como tipo
imutável e ordenável, a validação de formato acontece uma vez na fronteira,
e comparação e intervalo saem de graça - em vez de passar str solto por
dez funções."
```

---

## Tarefa 2: Cliente do Portal da Transparência

**Arquivos:**
- Criar: `src/tcc_jobs/portal/__init__.py`
- Criar: `src/tcc_jobs/portal/client.py`
- Modificar: `.importlinter`
- Teste: `tests/test_portal_client.py`

**Interfaces:**
- Produz: `ClientePortal` (Protocol) com `baixar(competencia: Competencia) -> bytes`; `ClienteHttpPortal(base_url: str, timeout: float)` como implementação; `CompetenciaIndisponivelError`.

Esta é a fronteira de I/O que justifica inversão de dependência: sem o Protocol, testar o pipeline exigiria rede.

- [ ] **Passo 1: Adicionar httpx**

```bash
docker compose exec jobs uv add httpx
```

- [ ] **Passo 2: Escrever o teste que falha**

Arquivo `tests/test_portal_client.py`:

```python
import httpx
import pytest

from tcc_jobs.core.competencia import Competencia
from tcc_jobs.portal.client import (
    URL_BASE,
    ClienteHttpPortal,
    CompetenciaIndisponivelError,
)

C = Competencia.de_str("202401")


def _cliente(handler: object) -> ClienteHttpPortal:
    transporte = httpx.MockTransport(handler)  # type: ignore[arg-type]
    return ClienteHttpPortal(transporte=transporte)


def test_monta_a_url_com_a_competencia() -> None:
    vistas: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        vistas.append(str(request.url))
        return httpx.Response(200, content=b"conteudo-zip")

    assert _cliente(handler).baixar(C) == b"conteudo-zip"
    assert vistas == [f"{URL_BASE}/202401"]


def test_403_significa_competencia_fora_da_janela() -> None:
    """De 202405 em diante a fonte devolve 403: foi descontinuada."""

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(403, content=b"<Error>AccessDenied</Error>")

    with pytest.raises(CompetenciaIndisponivelError, match="202405"):
        _cliente(handler).baixar(Competencia.de_str("202405"))


def test_erro_de_servidor_propaga() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(500)

    with pytest.raises(httpx.HTTPStatusError):
        _cliente(handler).baixar(C)


def test_segue_redirecionamento() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/202401"):
            return httpx.Response(302, headers={"Location": "https://exemplo/arquivo.zip"})
        return httpx.Response(200, content=b"zip-final")

    assert _cliente(handler).baixar(C) == b"zip-final"
```

- [ ] **Passo 3: Rodar e ver falhar**

```bash
docker compose exec jobs uv run pytest tests/test_portal_client.py -q
```

Esperado: `ModuleNotFoundError: No module named 'tcc_jobs.portal'`.

- [ ] **Passo 4: Implementar**

Criar `src/tcc_jobs/portal/__init__.py` vazio e `src/tcc_jobs/portal/client.py`:

```python
from typing import Protocol

import httpx

from tcc_jobs.core.competencia import Competencia

URL_BASE = "https://portaldatransparencia.gov.br/download-de-dados/licitacoes"


class CompetenciaIndisponivelError(Exception):
    """A fonte não publica esta competência.

    De 202405 em diante o Portal devolve 403: a base foi descontinuada com a
    transição para a Lei 14.133/2021.
    """


class ClientePortal(Protocol):
    """Fronteira de I/O com a fonte de dados.

    Existe para que o pipeline seja testável sem rede.
    """

    def baixar(self, competencia: Competencia) -> bytes: ...


class ClienteHttpPortal:
    """Implementação sobre httpx, seguindo redirecionamento."""

    def __init__(
        self,
        url_base: str = URL_BASE,
        timeout: float = 120.0,
        transporte: httpx.BaseTransport | None = None,
    ) -> None:
        self._url_base = url_base
        self._cliente = httpx.Client(
            timeout=timeout,
            follow_redirects=True,
            transport=transporte,
        )

    def baixar(self, competencia: Competencia) -> bytes:
        resposta = self._cliente.get(f"{self._url_base}/{competencia}")

        if resposta.status_code == httpx.codes.FORBIDDEN:
            raise CompetenciaIndisponivelError(
                f"competência {competencia} não está disponível na fonte "
                "(403: a base foi descontinuada a partir de 202405)"
            )

        resposta.raise_for_status()
        return resposta.content
```

- [ ] **Passo 5: Rodar e ver passar**

```bash
docker compose exec jobs uv run pytest tests/test_portal_client.py -q
```

Esperado: 4 passed. Nenhum acesso à rede - `MockTransport` intercepta tudo.

- [ ] **Passo 6: Registrar o contrato de arquitetura**

Em `.importlinter`, incluir `portal` nas camadas e proibir que ele conheça o banco:

```ini
[importlinter:contract:camadas]
name = A casca depende do núcleo, nunca o contrário
type = layers
layers =
    tcc_jobs.cli
    tcc_jobs.db | tcc_jobs.portal
    tcc_jobs.core
exhaustive = false

[importlinter:contract:portal-nao-conhece-banco]
name = O cliente da fonte não conhece persistência
type = forbidden
source_modules =
    tcc_jobs.portal
forbidden_modules =
    tcc_jobs.db
```

E acrescentar `tcc_jobs.portal` aos `forbidden_modules` do contrato `core-e-independente`.

```bash
docker compose exec jobs uv run lint-imports
```

Esperado: 4 contratos, todos `KEPT`.

- [ ] **Passo 7: Commit**

```bash
git add src/tcc_jobs/portal tests/test_portal_client.py .importlinter pyproject.toml uv.lock
git commit -m "feat: cliente do Portal da Transparência

Protocol mais implementação httpx. O Protocol existe para o pipeline ser
testável sem rede: os testes usam MockTransport e não fazem uma requisição.

403 recebe exceção própria: de 202405 em diante a fonte devolve esse status
porque a base foi descontinuada, e isso não é falha - é o fim da janela."
```

---

## Tarefa 3: Parser de Licitação

**Arquivos:**
- Criar: `src/tcc_jobs/etl/__init__.py`
- Criar: `src/tcc_jobs/etl/parsers.py`
- Modificar: `.importlinter`
- Teste: `tests/fixtures/202401_amostra.zip` (gerado no passo 1)
- Teste: `tests/test_parsers_licitacao.py`

**Interfaces:**
- Produz: `extrair_do_zip(conteudo: bytes) -> dict[str, bytes]`; `parse_licitacao(csv: bytes, competencia: Competencia) -> pl.DataFrame`.

Núcleo puro: recebe `bytes`, devolve `DataFrame`. Não sabe de onde vieram os bytes.

- [ ] **Passo 1: Criar a fixture a partir do dado real**

Amostra reduzida, preservando as peculiaridades de formato. Rodar uma vez:

```bash
docker compose exec jobs python -c "
import io, zipfile, pathlib

origem = zipfile.ZipFile('/data/lic202401.zip')
destino = pathlib.Path('/app/tests/fixtures')
destino.mkdir(parents=True, exist_ok=True)

with zipfile.ZipFile(destino / '202401_amostra.zip', 'w', zipfile.ZIP_DEFLATED) as saida:
    for nome in origem.namelist():
        linhas = origem.read(nome).split(b'\r\n')
        # cabeçalho mais 30 linhas: o suficiente para cobrir os casos de formato
        saida.writestr(nome, b'\r\n'.join(linhas[:31]))
print('fixture criada')
"
```

> A fixture entra no git: são poucos KB e é o que garante que o teste exercita o formato real, com acentos em `latin-1`, decimal com vírgula e datas vazias.

- [ ] **Passo 2: Escrever o teste que falha**

Arquivo `tests/test_parsers_licitacao.py`:

```python
from datetime import date
from decimal import Decimal
from pathlib import Path

import polars as pl
import pytest

from tcc_jobs.core.competencia import Competencia
from tcc_jobs.etl.parsers import extrair_do_zip, parse_licitacao

FIXTURE = Path(__file__).parent / "fixtures" / "202401_amostra.zip"
C = Competencia.de_str("202401")


@pytest.fixture
def arquivos() -> dict[str, bytes]:
    return extrair_do_zip(FIXTURE.read_bytes())


def test_extrai_os_quatro_csvs(arquivos: dict[str, bytes]) -> None:
    assert set(arquivos) == {
        "Licitação",
        "ItemLicitação",
        "ParticipantesLicitação",
        "EmpenhosRelacionados",
    }


def test_preserva_acentuacao_do_latin1(arquivos: dict[str, bytes]) -> None:
    """O Polars aceita apenas utf8 e utf8-lossy; o lossy corrompe até o nome
    das colunas. A decodificação precisa vir antes."""
    df = parse_licitacao(arquivos["Licitação"], C)

    nomes = df["nome_orgao_superior"].to_list()
    assert any("Ministério" in n for n in nomes)
    assert not any("�" in n for n in nomes)


def test_converte_decimal_com_virgula(arquivos: dict[str, bytes]) -> None:
    df = parse_licitacao(arquivos["Licitação"], C)

    assert df.schema["valor"] == pl.Decimal(18, 4)
    assert df["valor"][0] == Decimal("170612.0000")


def test_converte_data_no_formato_brasileiro(arquivos: dict[str, bytes]) -> None:
    df = parse_licitacao(arquivos["Licitação"], C)

    assert df.schema["data_abertura"] == pl.Date
    assert df["data_abertura"][0] == date(2023, 12, 26)


def test_tolera_data_de_abertura_vazia(arquivos: dict[str, bytes]) -> None:
    """16% das linhas do dado real vêm sem data de abertura."""
    df = parse_licitacao(arquivos["Licitação"], C)

    assert df["data_abertura"].is_null().sum() >= 1


def test_acrescenta_a_competencia_de_origem(arquivos: dict[str, bytes]) -> None:
    df = parse_licitacao(arquivos["Licitação"], C)

    assert df["competencia"].unique().to_list() == ["202401"]


def test_colunas_da_chave_natural_presentes(arquivos: dict[str, bytes]) -> None:
    df = parse_licitacao(arquivos["Licitação"], C)

    assert {"numero_licitacao", "codigo_ug", "codigo_modalidade"} <= set(df.columns)
    assert df.schema["codigo_modalidade"] == pl.Int32


def test_preserva_colunas_das_dimensoes(arquivos: dict[str, bytes]) -> None:
    """O parser não distribui - a carga é que separa cada coluna para a tabela
    correta. Ver [[Licitações - Decisões de Modelagem]]."""
    df = parse_licitacao(arquivos["Licitação"], C)

    assert {"modalidade", "uf", "municipio", "nome_ug", "nome_orgao_superior"} <= set(df.columns)


def test_arquivo_vazio_devolve_dataframe_vazio_com_esquema(arquivos: dict[str, bytes]) -> None:
    """EmpenhosRelacionados pode ter zero linhas - é caso normal, não erro."""
    df = parse_licitacao(b"", C)

    assert df.height == 0
    assert "numero_licitacao" in df.columns
```

- [ ] **Passo 3: Rodar e ver falhar**

```bash
docker compose exec jobs uv run pytest tests/test_parsers_licitacao.py -q
```

Esperado: `ModuleNotFoundError: No module named 'tcc_jobs.etl.parsers'`.

- [ ] **Passo 4: Implementar**

Criar `src/tcc_jobs/etl/__init__.py` vazio e `src/tcc_jobs/etl/parsers.py`:

```python
import io
import zipfile

import polars as pl

from tcc_jobs.core.competencia import Competencia

# Colunas do CSV de licitação, na ordem em que aparecem, mapeadas para o nome
# no banco. Ver o esquema em [[Licitações - Modelo de Dados]].
COLUNAS_LICITACAO = {
    "Número Licitação": "numero_licitacao",
    "Código UG": "codigo_ug",
    "Nome UG": "nome_ug",
    "Código Modalidade Compra": "codigo_modalidade",
    "Modalidade Compra": "modalidade",
    "Número Processo": "numero_processo",
    "Objeto": "objeto",
    "Situação Licitação": "situacao",
    "Código Órgão Superior": "codigo_orgao_superior",
    "Nome Órgão Superior": "nome_orgao_superior",
    "Código Órgão": "codigo_orgao",
    "Nome Órgão": "nome_orgao",
    "UF": "uf",
    "Município": "municipio",
    "Data Resultado Compra": "data_resultado",
    "Data Abertura": "data_abertura",
    "Valor Licitação": "valor",
}

# O CSV traz, em cada linha de licitação, atributos que pertencem às dimensões.
# O parser preserva todas as colunas; a carga é que distribui cada uma para a
# tabela correta - ver [[Licitações - Decisões de Modelagem]].
#
#   codigo_modalidade, modalidade      -> modalidade
#   codigo_ug, nome_ug, uf, municipio  -> unidade_gestora
#   codigo_orgao, nome_orgao,
#   codigo_orgao_superior              -> orgao (hierarquia auto-relacionada)


def extrair_do_zip(conteudo: bytes) -> dict[str, bytes]:
    """Devolve os CSVs do ZIP indexados pelo tipo, sem o prefixo de competência.

    Função pura: opera sobre bytes em memória, sem tocar em disco.
    """
    arquivos: dict[str, bytes] = {}
    with zipfile.ZipFile(io.BytesIO(conteudo)) as zip_:
        for nome in zip_.namelist():
            # "202401_Licitação.csv" -> "Licitação"
            tipo = nome.split("_", 1)[1].removesuffix(".csv")
            arquivos[tipo] = zip_.read(nome)
    return arquivos


def _ler_csv(csv: bytes) -> pl.DataFrame:
    """Lê o CSV como texto puro, sem inferir tipos.

    O Polars aceita apenas utf8 e utf8-lossy - não existe opção latin-1, e o
    lossy corrompe os acentos inclusive nos nomes das colunas. Por isso a
    decodificação acontece aqui, antes de o Polars ver os bytes.

    infer_schema_length=0 mantém tudo como string: a conversão de decimal e
    data é explícita, porque o formato brasileiro não é reconhecido.
    """
    texto = csv.decode("latin-1")
    return pl.read_csv(
        io.BytesIO(texto.encode("utf-8")),
        separator=";",
        infer_schema_length=0,
        truncate_ragged_lines=True,
    )


def _decimal(coluna: str) -> pl.Expr:
    """Converte decimal em formato brasileiro.

    Verificado no dado real: não há separador de milhar - o maior valor
    observado é 10665589,3300. Basta trocar a vírgula por ponto.
    """
    return pl.col(coluna).str.replace(",", ".").cast(pl.Decimal(18, 4), strict=False)


def _data(coluna: str) -> pl.Expr:
    """Converte DD/MM/AAAA. strict=False porque 16% das datas de abertura
    vêm vazias no dado real."""
    return pl.col(coluna).str.to_date("%d/%m/%Y", strict=False)


def parse_licitacao(csv: bytes, competencia: Competencia) -> pl.DataFrame:
    """CSV de licitação para DataFrame tipado, pronto para carga."""
    esquema_vazio = {
        "numero_licitacao": pl.String,
        "codigo_ug": pl.String,
        "nome_ug": pl.String,
        "codigo_modalidade": pl.Int32,
        "modalidade": pl.String,
        "numero_processo": pl.String,
        "objeto": pl.String,
        "situacao": pl.String,
        "codigo_orgao_superior": pl.String,
        "nome_orgao_superior": pl.String,
        "codigo_orgao": pl.String,
        "nome_orgao": pl.String,
        "uf": pl.String,
        "municipio": pl.String,
        "data_resultado": pl.Date,
        "data_abertura": pl.Date,
        "valor": pl.Decimal(18, 4),
        "competencia": pl.String,
    }
    if not csv.strip():
        return pl.DataFrame(schema=esquema_vazio)

    return (
        _ler_csv(csv)
        .rename(COLUNAS_LICITACAO)
        .with_columns(
            pl.col("codigo_modalidade").cast(pl.Int32, strict=False),
            _data("data_abertura"),
            _data("data_resultado"),
            _decimal("valor"),
            pl.lit(str(competencia)).alias("competencia"),
        )
        .select(list(esquema_vazio))
    )
```

- [ ] **Passo 5: Rodar e ver passar**

```bash
docker compose exec jobs uv run pytest tests/test_parsers_licitacao.py -v
```

Esperado: 8 passed.

- [ ] **Passo 6: Registrar o contrato do núcleo**

Em `.importlinter`, acrescentar:

```ini
[importlinter:contract:nucleo-etl-e-puro]
name = Parsers não fazem I/O
type = forbidden
source_modules =
    tcc_jobs.etl.parsers
forbidden_modules =
    tcc_jobs.db
    tcc_jobs.portal
    tcc_jobs.cli
```

```bash
docker compose exec jobs uv run lint-imports
```

Esperado: 5 contratos `KEPT`.

- [ ] **Passo 7: Commit**

```bash
git add src/tcc_jobs/etl tests/test_parsers_licitacao.py tests/fixtures .importlinter
git commit -m "feat: parser de licitação com as armadilhas de formato

Núcleo puro: recebe bytes, devolve DataFrame tipado.

A decodificação latin-1 acontece antes de o Polars ver os bytes, porque ele
aceita apenas utf8 e utf8-lossy - e o lossy corrompe os acentos inclusive
nos nomes das colunas, o que faz a coluna 'Nome Órgão Superior' deixar de
ser encontrada.

Verificado no dado real: não há separador de milhar, e 16% das datas de
abertura vêm vazias. A fixture é amostra da competência 202401, com o
formato original preservado."
```

---

## Tarefa 4: Parsers de item e participante

**Arquivos:**
- Modificar: `src/tcc_jobs/etl/parsers.py`
- Teste: `tests/test_parsers_item_participante.py`

**Interfaces:**
- Produz: `parse_item(csv: bytes) -> pl.DataFrame`; `parse_participante(csv: bytes) -> pl.DataFrame`.

- [ ] **Passo 1: Escrever o teste que falha**

Arquivo `tests/test_parsers_item_participante.py`:

```python
from decimal import Decimal
from pathlib import Path

import polars as pl
import pytest

from tcc_jobs.etl.parsers import extrair_do_zip, parse_item, parse_participante

FIXTURE = Path(__file__).parent / "fixtures" / "202401_amostra.zip"


@pytest.fixture
def arquivos() -> dict[str, bytes]:
    return extrair_do_zip(FIXTURE.read_bytes())


def test_item_converte_valor_e_quantidade(arquivos: dict[str, bytes]) -> None:
    df = parse_item(arquivos["ItemLicitação"])

    assert df.schema["valor_item"] == pl.Decimal(18, 4)
    assert df.schema["quantidade"] == pl.Decimal(18, 4)
    assert df["valor_item"][0] == Decimal("99500.0000")


def test_item_traz_a_chave_natural_e_o_vencedor(arquivos: dict[str, bytes]) -> None:
    df = parse_item(arquivos["ItemLicitação"])

    assert {"numero_licitacao", "codigo_ug", "codigo_modalidade"} <= set(df.columns)
    assert df["cnpj_vencedor"][0] == "24426491000103"


def test_participante_converte_flag_para_booleano(arquivos: dict[str, bytes]) -> None:
    """Flag Vencedor vem como SIM/NÃO, com acento em latin-1."""
    df = parse_participante(arquivos["ParticipantesLicitação"])

    assert df.schema["flag_vencedor"] == pl.Boolean
    assert set(df["flag_vencedor"].unique().to_list()) <= {True, False}


def test_participante_preserva_nome_com_acento(arquivos: dict[str, bytes]) -> None:
    df = parse_participante(arquivos["ParticipantesLicitação"])

    assert not any("�" in n for n in df["nome_participante"].to_list())


def test_participante_traz_cnpj(arquivos: dict[str, bytes]) -> None:
    df = parse_participante(arquivos["ParticipantesLicitação"])

    assert df["cnpj_participante"][0] == "14986916000177"


def test_arquivo_vazio_nao_e_erro(arquivos: dict[str, bytes]) -> None:
    """EmpenhosRelacionados vem sem linhas em algumas competências."""
    assert parse_item(b"").height == 0
    assert parse_participante(b"").height == 0
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
docker compose exec jobs uv run pytest tests/test_parsers_item_participante.py -q
```

Esperado: `ImportError: cannot import name 'parse_item'`.

- [ ] **Passo 3: Implementar**

Acrescentar a `src/tcc_jobs/etl/parsers.py`:

```python
COLUNAS_ITEM = {
    "Número Licitação": "numero_licitacao",
    "Código UG": "codigo_ug",
    "Código Modalidade Compra": "codigo_modalidade",
    "Código Item Compra": "codigo_item_compra",
    "Descrição": "descricao",
    "Quantidade Item": "quantidade",
    "Valor Item": "valor_item",
    "Código Vencedor": "cnpj_vencedor",
    "Nome Vencedor": "nome_vencedor",
}

COLUNAS_PARTICIPANTE = {
    "Número Licitação": "numero_licitacao",
    "Código UG": "codigo_ug",
    "Código Modalidade Compra": "codigo_modalidade",
    "Código Item Compra": "codigo_item_compra",
    "Código Participante": "cnpj_participante",
    "Nome Participante": "nome_participante",
    "Flag Vencedor": "flag_vencedor",
}

ESQUEMA_ITEM = {
    "numero_licitacao": pl.String,
    "codigo_ug": pl.String,
    "codigo_modalidade": pl.Int32,
    "codigo_item_compra": pl.String,
    "descricao": pl.String,
    "quantidade": pl.Decimal(18, 4),
    "valor_item": pl.Decimal(18, 4),
    "cnpj_vencedor": pl.String,
    "nome_vencedor": pl.String,
}

ESQUEMA_PARTICIPANTE = {
    "numero_licitacao": pl.String,
    "codigo_ug": pl.String,
    "codigo_modalidade": pl.Int32,
    "codigo_item_compra": pl.String,
    "cnpj_participante": pl.String,
    "nome_participante": pl.String,
    "flag_vencedor": pl.Boolean,
}


def parse_item(csv: bytes) -> pl.DataFrame:
    """CSV de itens licitados para DataFrame tipado."""
    if not csv.strip():
        return pl.DataFrame(schema=ESQUEMA_ITEM)

    return (
        _ler_csv(csv)
        .rename(COLUNAS_ITEM)
        .with_columns(
            pl.col("codigo_modalidade").cast(pl.Int32, strict=False),
            _decimal("quantidade"),
            _decimal("valor_item"),
        )
        .select(list(ESQUEMA_ITEM))
    )


def parse_participante(csv: bytes) -> pl.DataFrame:
    """CSV de participantes para DataFrame tipado.

    Flag Vencedor vem como SIM/NÃO - com acento, o que reforça a necessidade
    de decodificar latin-1 antes.
    """
    if not csv.strip():
        return pl.DataFrame(schema=ESQUEMA_PARTICIPANTE)

    return (
        _ler_csv(csv)
        .rename(COLUNAS_PARTICIPANTE)
        .with_columns(
            pl.col("codigo_modalidade").cast(pl.Int32, strict=False),
            (pl.col("flag_vencedor").str.strip_chars() == "SIM").alias("flag_vencedor"),
        )
        .select(list(ESQUEMA_PARTICIPANTE))
    )
```

- [ ] **Passo 4: Rodar e ver passar**

```bash
docker compose exec jobs uv run pytest tests/test_parsers_item_participante.py -v
```

Esperado: 6 passed.

- [ ] **Passo 5: Suíte, tipos e contratos**

```bash
docker compose exec jobs uv run pytest -q
docker compose exec jobs uv run ruff check . && docker compose exec jobs uv run pyright
docker compose exec jobs uv run lint-imports
```

- [ ] **Passo 6: Commit**

```bash
git add src/tcc_jobs/etl/parsers.py tests/test_parsers_item_participante.py
git commit -m "feat: parsers de item e participante

Flag Vencedor vem como SIM/NÃO com acento, o que reforça a necessidade da
decodificação latin-1 antes do Polars.

O CSV de participantes é o mais valioso da fonte: é ele que habilita os
atributos de competitividade da detecção de anomalias."
```

---

## Tarefa 5: Camadas bronze e silver

**Arquivos:**
- Criar: `src/tcc_jobs/etl/armazenamento.py`
- Teste: `tests/test_armazenamento.py`

**Interfaces:**
- Produz: `Armazenamento(raiz: Path)` com `gravar_bronze(competencia, conteudo: bytes) -> Path`, `ler_bronze(competencia) -> bytes | None`, `gravar_silver(competencia, tabela: str, df: pl.DataFrame) -> Path`, `caminho_silver(competencia, tabela) -> Path`.

Casca: toca em disco. A raiz é injetada, então os testes usam `tmp_path`.

- [ ] **Passo 1: Escrever o teste que falha**

Arquivo `tests/test_armazenamento.py`:

```python
from pathlib import Path

import polars as pl

from tcc_jobs.core.competencia import Competencia
from tcc_jobs.etl.armazenamento import Armazenamento

C = Competencia.de_str("202401")


def test_grava_e_le_bronze(tmp_path: Path) -> None:
    arm = Armazenamento(tmp_path)

    caminho = arm.gravar_bronze(C, b"conteudo-zip")

    assert caminho.exists()
    assert arm.ler_bronze(C) == b"conteudo-zip"


def test_bronze_ausente_devolve_none(tmp_path: Path) -> None:
    assert Armazenamento(tmp_path).ler_bronze(C) is None


def test_bronze_e_imutavel_por_convencao(tmp_path: Path) -> None:
    """Regravar a mesma competência sobrescreve, mas o conteúdo vem sempre da
    fonte - bronze nunca é transformado."""
    arm = Armazenamento(tmp_path)
    arm.gravar_bronze(C, b"primeiro")
    arm.gravar_bronze(C, b"segundo")

    assert arm.ler_bronze(C) == b"segundo"


def test_grava_silver_em_parquet(tmp_path: Path) -> None:
    arm = Armazenamento(tmp_path)
    df = pl.DataFrame({"a": [1, 2, 3], "b": ["x", "y", "z"]})

    caminho = arm.gravar_silver(C, "licitacao", df)

    assert caminho.suffix == ".parquet"
    assert pl.read_parquet(caminho).equals(df)


def test_silver_separa_por_tabela_e_competencia(tmp_path: Path) -> None:
    arm = Armazenamento(tmp_path)

    c1 = arm.caminho_silver(C, "licitacao")
    c2 = arm.caminho_silver(Competencia.de_str("202402"), "licitacao")
    c3 = arm.caminho_silver(C, "participante")

    assert len({c1, c2, c3}) == 3
    assert "licitacao" in str(c1.parent)


def test_parquet_comprime(tmp_path: Path) -> None:
    """O ganho do Parquet vem da compressão colunar: os CSVs têm CNPJ e nome
    de empresa repetidos milhares de vezes."""
    arm = Armazenamento(tmp_path)
    df = pl.DataFrame({"cnpj": ["14986916000177"] * 10_000})

    caminho = arm.gravar_silver(C, "participante", df)

    assert caminho.stat().st_size < 10_000
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
docker compose exec jobs uv run pytest tests/test_armazenamento.py -q
```

Esperado: `ModuleNotFoundError`.

- [ ] **Passo 3: Implementar**

Arquivo `src/tcc_jobs/etl/armazenamento.py`:

```python
from pathlib import Path

import polars as pl

from tcc_jobs.core.competencia import Competencia


class Armazenamento:
    """Acesso ao disco nas camadas bronze e silver.

    Bronze guarda o ZIP como veio da fonte e nunca é transformado: descobrir
    um erro de conversão semanas depois exige reprocessar a partir dele, sem
    baixar 136 arquivos de novo.

    Silver guarda Parquet tipado, particionado por tabela e competência.
    """

    def __init__(self, raiz: Path) -> None:
        self._raiz = raiz

    @property
    def bronze(self) -> Path:
        return self._raiz / "bronze"

    @property
    def silver(self) -> Path:
        return self._raiz / "silver"

    def _caminho_bronze(self, competencia: Competencia) -> Path:
        return self.bronze / f"{competencia}.zip"

    def gravar_bronze(self, competencia: Competencia, conteudo: bytes) -> Path:
        caminho = self._caminho_bronze(competencia)
        caminho.parent.mkdir(parents=True, exist_ok=True)
        caminho.write_bytes(conteudo)
        return caminho

    def ler_bronze(self, competencia: Competencia) -> bytes | None:
        caminho = self._caminho_bronze(competencia)
        return caminho.read_bytes() if caminho.exists() else None

    def caminho_silver(self, competencia: Competencia, tabela: str) -> Path:
        return self.silver / tabela / f"{competencia}.parquet"

    def gravar_silver(
        self, competencia: Competencia, tabela: str, df: pl.DataFrame
    ) -> Path:
        caminho = self.caminho_silver(competencia, tabela)
        caminho.parent.mkdir(parents=True, exist_ok=True)
        df.write_parquet(caminho, compression="zstd")
        return caminho
```

- [ ] **Passo 4: Rodar e ver passar**

```bash
docker compose exec jobs uv run pytest tests/test_armazenamento.py -v
```

Esperado: 6 passed.

- [ ] **Passo 5: Commit**

```bash
git add src/tcc_jobs/etl/armazenamento.py tests/test_armazenamento.py
git commit -m "feat: camadas bronze e silver

Bronze guarda o ZIP intocado: descobrir um erro de conversão semanas depois
exige reprocessar a partir dele, sem rebaixar 136 arquivos.

Silver usa Parquet com zstd, particionado por tabela e competência."
```

---

## Tarefa 6: Job ingest

**Arquivos:**
- Criar: `src/tcc_jobs/etl/pipeline.py`
- Modificar: `src/tcc_jobs/cli.py`
- Modificar: `.importlinter`
- Teste: `tests/test_pipeline_ingest.py`

**Interfaces:**
- Produz: `ingerir(competencias, cliente: ClientePortal, armazenamento: Armazenamento, forcar_download: bool = False) -> list[ResultadoIngestao]`; `ResultadoIngestao` com `competencia`, `linhas_por_tabela: dict[str, int]`, `veio_do_cache: bool`, `erro: str | None`.

Casca: orquestra download, parse e escrita. Recebe cliente e armazenamento por injeção.

- [ ] **Passo 1: Escrever o teste que falha**

Primeiro o dublê, em `tests/conftest.py` - vai ser usado também pelo teste de
carga, e importar entre arquivos de teste é frágil:

```python
# acrescentar ao conftest.py existente
from pathlib import Path

from tcc_jobs.core.competencia import Competencia
from tcc_jobs.portal.client import CompetenciaIndisponivelError

FIXTURE_ZIP = Path(__file__).parent / "fixtures" / "202401_amostra.zip"


class ClientePortalFalso:
    """Dublê do ClientePortal: conta chamadas e não usa rede."""

    def __init__(self, conteudo: bytes, indisponiveis: set[str] | None = None) -> None:
        self._conteudo = conteudo
        self._indisponiveis = indisponiveis or set()
        self.chamadas: list[str] = []

    def baixar(self, competencia: Competencia) -> bytes:
        self.chamadas.append(str(competencia))
        if str(competencia) in self._indisponiveis:
            raise CompetenciaIndisponivelError(f"{competencia} indisponível")
        return self._conteudo


@pytest.fixture
def zip_amostra() -> bytes:
    return FIXTURE_ZIP.read_bytes()
```

Arquivo `tests/test_pipeline_ingest.py`:

```python
from pathlib import Path

from tcc_jobs.core.competencia import Competencia
from tcc_jobs.etl.armazenamento import Armazenamento
from tcc_jobs.etl.pipeline import ingerir

from tests.conftest import ClientePortalFalso  # noqa: F401 - vem do conftest

C = Competencia.de_str("202401")


def test_grava_bronze_e_silver(tmp_path: Path, zip_amostra: bytes) -> None:
    arm = Armazenamento(tmp_path)
    cliente = ClientePortalFalso(zip_amostra)

    resultados = ingerir([C], cliente, arm)

    assert len(resultados) == 1
    assert arm.ler_bronze(C) is not None
    for tabela in ("licitacao", "item", "participante"):
        assert arm.caminho_silver(C, tabela).exists()


def test_conta_linhas_por_tabela(tmp_path: Path, zip_amostra: bytes) -> None:
    cliente = ClientePortalFalso(zip_amostra)

    resultado = ingerir([C], cliente, Armazenamento(tmp_path))[0]

    assert resultado.linhas_por_tabela["licitacao"] > 0
    assert resultado.linhas_por_tabela["participante"] > 0
    assert resultado.erro is None


def test_reaproveita_bronze_existente(tmp_path: Path, zip_amostra: bytes) -> None:
    """Reprocessar não deve rebaixar: bronze é a fonte de reprocessamento."""
    arm = Armazenamento(tmp_path)
    cliente = ClientePortalFalso(zip_amostra)

    ingerir([C], cliente, arm)
    resultado = ingerir([C], cliente, arm)[0]

    assert cliente.chamadas == ["202401"]
    assert resultado.veio_do_cache is True


def test_forcar_download_ignora_o_cache(tmp_path: Path, zip_amostra: bytes) -> None:
    arm = Armazenamento(tmp_path)
    cliente = ClientePortalFalso(zip_amostra)

    ingerir([C], cliente, arm)
    ingerir([C], cliente, arm, forcar_download=True)

    assert cliente.chamadas == ["202401", "202401"]


def test_competencia_indisponivel_nao_interrompe_as_outras(
    tmp_path: Path, zip_amostra: bytes
) -> None:
    """De 202405 em diante a fonte devolve 403. Isso não é falha do job."""
    arm = Armazenamento(tmp_path)
    cliente = ClientePortalFalso(zip_amostra, indisponiveis={"202405"})
    janela = [C, Competencia.de_str("202405")]

    resultados = ingerir(janela, cliente, arm)

    assert resultados[0].erro is None
    assert resultados[1].erro is not None
    assert "indisponível" in resultados[1].erro
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
docker compose exec jobs uv run pytest tests/test_pipeline_ingest.py -q
```

Esperado: `ModuleNotFoundError: No module named 'tcc_jobs.etl.pipeline'`.

- [ ] **Passo 3: Implementar**

Arquivo `src/tcc_jobs/etl/pipeline.py`:

```python
import logging
from dataclasses import dataclass, field

from tcc_jobs.core.competencia import Competencia
from tcc_jobs.etl.armazenamento import Armazenamento
from tcc_jobs.etl.parsers import (
    extrair_do_zip,
    parse_item,
    parse_licitacao,
    parse_participante,
)
from tcc_jobs.portal.client import ClientePortal, CompetenciaIndisponivelError

logger = logging.getLogger(__name__)

# Nome no ZIP -> nome da tabela em silver
TABELAS = {
    "Licitação": "licitacao",
    "ItemLicitação": "item",
    "ParticipantesLicitação": "participante",
}


@dataclass
class ResultadoIngestao:
    competencia: Competencia
    linhas_por_tabela: dict[str, int] = field(default_factory=dict)
    veio_do_cache: bool = False
    erro: str | None = None


def ingerir(
    competencias: list[Competencia],
    cliente: ClientePortal,
    armazenamento: Armazenamento,
    forcar_download: bool = False,
) -> list[ResultadoIngestao]:
    """Baixa, converte e grava em silver, uma competência por vez.

    Competência indisponível não interrompe as demais: de 202405 em diante a
    fonte devolve 403, e isso é o fim da janela, não falha do job.
    """
    return [
        _ingerir_uma(c, cliente, armazenamento, forcar_download) for c in competencias
    ]


def _ingerir_uma(
    competencia: Competencia,
    cliente: ClientePortal,
    armazenamento: Armazenamento,
    forcar_download: bool,
) -> ResultadoIngestao:
    resultado = ResultadoIngestao(competencia=competencia)

    try:
        conteudo = None if forcar_download else armazenamento.ler_bronze(competencia)
        if conteudo is None:
            conteudo = cliente.baixar(competencia)
            armazenamento.gravar_bronze(competencia, conteudo)
        else:
            resultado.veio_do_cache = True

        arquivos = extrair_do_zip(conteudo)

        for nome_zip, tabela in TABELAS.items():
            csv = arquivos.get(nome_zip, b"")
            df = (
                parse_licitacao(csv, competencia)
                if tabela == "licitacao"
                else parse_item(csv)
                if tabela == "item"
                else parse_participante(csv)
            )
            armazenamento.gravar_silver(competencia, tabela, df)
            resultado.linhas_por_tabela[tabela] = df.height

        logger.info("ingest %s: %s", competencia, resultado.linhas_por_tabela)

    except CompetenciaIndisponivelError as erro:
        resultado.erro = str(erro)
        logger.warning("ingest %s: %s", competencia, erro)
    except Exception as erro:  # noqa: BLE001 - uma competência ruim não derruba o lote
        resultado.erro = f"{type(erro).__name__}: {erro}"
        logger.exception("ingest %s falhou", competencia)

    return resultado
```

- [ ] **Passo 4: Rodar e ver passar**

```bash
docker compose exec jobs uv run pytest tests/test_pipeline_ingest.py -v
```

Esperado: 5 passed.

- [ ] **Passo 5: Ligar na CLI**

Em `src/tcc_jobs/cli.py`, substituir o corpo de `ingest`:

```python
@app.command()
def ingest(
    de: str = typer.Option(..., help="Competência inicial, AAAAMM"),
    ate: str = typer.Option(..., help="Competência final, AAAAMM"),
    forcar_download: bool = typer.Option(False, help="Ignora o cache em bronze"),
) -> None:
    """Baixa os ZIPs e grava Parquet limpo em silver."""
    from tcc_jobs.core.config import settings
    from tcc_jobs.etl.armazenamento import Armazenamento
    from tcc_jobs.etl.pipeline import ingerir
    from tcc_jobs.portal.client import ClienteHttpPortal

    competencias = _intervalo(de, ate)
    resultados = ingerir(
        competencias,
        ClienteHttpPortal(),
        Armazenamento(settings.data_dir),
        forcar_download=forcar_download,
    )

    com_erro = [r for r in resultados if r.erro]
    total = sum(sum(r.linhas_por_tabela.values()) for r in resultados)
    typer.echo(f"{len(resultados) - len(com_erro)} competências, {total} linhas em silver")
    for r in com_erro:
        typer.echo(f"  {r.competencia}: {r.erro}", err=True)
```

> O import fica dentro da função de propósito: mantém a CLI leve e evita que importar `cli` arraste Polars e httpx.

- [ ] **Passo 6: Registrar o contrato**

Em `.importlinter`, `tcc_jobs.etl.pipeline` é casca e **pode** importar `portal`. Acrescentar às camadas:

```ini
[importlinter:contract:camadas]
layers =
    tcc_jobs.cli
    tcc_jobs.etl.pipeline
    tcc_jobs.db | tcc_jobs.portal
    tcc_jobs.etl.parsers | tcc_jobs.etl.armazenamento
    tcc_jobs.core
exhaustive = false
```

```bash
docker compose exec jobs uv run lint-imports
```

- [ ] **Passo 7: Verificar com uma competência real**

```bash
docker compose exec jobs uv run tcc ingest --de 202401 --ate 202401
docker compose exec jobs ls -la /data/silver/licitacao/ /data/bronze/
```

Esperado: `2537` linhas em licitacao e os Parquet gravados. Compare o tamanho do Parquet com o CSV original - a compressão deve ser expressiva.

- [ ] **Passo 8: Commit**

```bash
git add src/tcc_jobs/etl/pipeline.py src/tcc_jobs/cli.py tests/test_pipeline_ingest.py .importlinter
git commit -m "feat: job ingest com cache em bronze

Reprocessar não rebaixa: bronze é a fonte de reprocessamento, e --forcar-download
existe para quando a fonte muda.

Competência indisponível não interrompe o lote. De 202405 em diante a fonte
devolve 403, e isso é o fim da janela documentada, não falha do job."
```

---

## Tarefa 7: Carga em massa com COPY

**Arquivos:**
- Criar: `src/tcc_jobs/db/copiador.py`
- Teste: `tests/test_copiador.py`

**Interfaces:**
- Produz: `copiar_para_tabela(conn, tabela: str, df: pl.DataFrame, colunas: list[str]) -> int`.

O ponto de desempenho mais crítico do projeto. Inserir 74,8 milhões de linhas por ORM levaria horas; por `COPY`, minutos.

- [ ] **Passo 1: Escrever o teste que falha**

Arquivo `tests/test_copiador.py`:

```python
from decimal import Decimal

import polars as pl
from sqlalchemy import Engine, text

from tcc_jobs.db.copiador import copiar_para_tabela


def test_copia_linhas_para_a_tabela(sessao, engine: Engine) -> None:
    df = pl.DataFrame(
        {
            "codigo_orgao": ["22000", "26000"],
            "nome": ["Agricultura", "Educação"],
            "codigo_orgao_superior": [None, None],
            "nome_orgao_superior": [None, None],
        }
    )

    with engine.begin() as conn:
        inseridas = copiar_para_tabela(conn, "orgao", df, list(df.columns))

    assert inseridas == 2
    assert sessao.execute(text("SELECT count(*) FROM orgao")).scalar() == 2


def test_preserva_acentuacao(sessao, engine: Engine) -> None:
    df = pl.DataFrame(
        {
            "codigo_orgao": ["26000"],
            "nome": ["Ministério da Educação"],
            "codigo_orgao_superior": [None],
            "nome_orgao_superior": [None],
        }
    )

    with engine.begin() as conn:
        copiar_para_tabela(conn, "orgao", df, list(df.columns))

    nome = sessao.execute(text("SELECT nome FROM orgao")).scalar()
    assert nome == "Ministério da Educação"


def test_preserva_precisao_decimal(sessao, engine: Engine) -> None:
    df = pl.DataFrame(
        {
            "competencia": ["202401"],
            "codigo_orgao": ["22000"],
            "codigo_modalidade": [5],
            "quantidade_licitacoes": [120],
            "valor_total": [Decimal("4500000.1234")],
            "valor_mediano": [Decimal("32000.5678")],
        }
    )

    with engine.begin() as conn:
        copiar_para_tabela(conn, "serie_mensal", df, list(df.columns))

    valor = sessao.execute(text("SELECT valor_total FROM serie_mensal")).scalar()
    assert valor == Decimal("4500000.1234")


def test_dataframe_vazio_nao_falha(sessao, engine: Engine) -> None:
    df = pl.DataFrame(schema={"codigo_orgao": pl.String, "nome": pl.String})

    with engine.begin() as conn:
        assert copiar_para_tabela(conn, "orgao", df, list(df.columns)) == 0


def test_nulos_chegam_como_null(sessao, engine: Engine) -> None:
    df = pl.DataFrame(
        {
            "codigo_orgao": ["22000"],
            "nome": ["Agricultura"],
            "codigo_orgao_superior": [None],
            "nome_orgao_superior": [None],
        }
    )

    with engine.begin() as conn:
        copiar_para_tabela(conn, "orgao", df, list(df.columns))

    resultado = sessao.execute(
        text("SELECT codigo_orgao_superior FROM orgao WHERE codigo_orgao = '22000'")
    ).scalar()
    assert resultado is None
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
docker compose exec jobs uv run pytest tests/test_copiador.py -q
```

Esperado: `ModuleNotFoundError: No module named 'tcc_jobs.db.copiador'`.

- [ ] **Passo 3: Implementar**

Arquivo `src/tcc_jobs/db/copiador.py`:

```python
import polars as pl
from sqlalchemy import Connection


def copiar_para_tabela(
    conn: Connection,
    tabela: str,
    df: pl.DataFrame,
    colunas: list[str],
) -> int:
    """Carga em massa via COPY do PostgreSQL.

    É a diferença entre minutos e horas: são 74,8 milhões de linhas em
    participante_licitacao, e inserção por ORM instanciaria um objeto Python
    para cada uma.

    Usa o formato binário do psycopg3, que dispensa serialização para texto
    e preserva tipos - inclusive Decimal, sem passar por float.
    """
    if df.height == 0:
        return 0

    lista_colunas = ", ".join(f'"{c}"' for c in colunas)
    sql = f'COPY "{tabela}" ({lista_colunas}) FROM STDIN'

    cursor = conn.connection.cursor()  # type: ignore[attr-defined]
    with cursor.copy(sql) as copy:
        # iter_rows evita materializar a tabela inteira como lista de tuplas.
        for linha in df.select(colunas).iter_rows():
            copy.write_row(linha)

    return df.height
```

> `iter_rows` percorre o DataFrame em Rust e entrega tuplas prontas - não é laço Python sobre dados brutos, e é a interface que o `copy.write_row` exige. A alternativa (`to_dicts()`) materializaria milhões de dicionários.

- [ ] **Passo 4: Rodar e ver passar**

```bash
docker compose exec jobs uv run pytest tests/test_copiador.py -v
```

Esperado: 5 passed.

- [ ] **Passo 5: Medir contra o ORM**

Confirmar a premissa em vez de confiar nela:

```bash
docker compose exec jobs python -c "
import time
from decimal import Decimal
import polars as pl
from sqlalchemy import text
from tcc_jobs.core.config import settings
from tcc_jobs.db.base import Base
from tcc_jobs.db.copiador import copiar_para_tabela
from tcc_jobs.db.models import Orgao
from tcc_jobs.db.session import criar_engine, criar_sessionmaker

engine = criar_engine(settings.test_database_url)
Base.metadata.drop_all(engine); Base.metadata.create_all(engine)

N = 50_000
df = pl.DataFrame({
    'codigo_orgao': [str(100000 + i) for i in range(N)],
    'nome': ['Órgão de teste'] * N,
    'codigo_orgao_superior': [None] * N,
    'nome_orgao_superior': [None] * N,
})

t0 = time.perf_counter()
with engine.begin() as conn:
    copiar_para_tabela(conn, 'orgao', df, list(df.columns))
copy_s = time.perf_counter() - t0

with engine.begin() as conn:
    conn.execute(text('TRUNCATE orgao CASCADE'))

t0 = time.perf_counter()
with criar_sessionmaker(engine)() as s:
    s.add_all([Orgao(codigo_orgao=str(100000+i), nome='Órgão de teste') for i in range(N)])
    s.commit()
orm_s = time.perf_counter() - t0

print(f'  COPY: {copy_s:.2f}s | ORM: {orm_s:.2f}s | COPY é {orm_s/copy_s:.1f}x mais rápido')
"
```

Registre o número obtido: ele justifica a decisão na monografia.

- [ ] **Passo 6: Commit**

```bash
git add src/tcc_jobs/db/copiador.py tests/test_copiador.py
git commit -m "feat: carga em massa via COPY

Ponto de desempenho mais crítico do projeto: são 74,8 milhões de linhas em
participante_licitacao, e inserção por ORM instanciaria um objeto Python
para cada uma.

Usa o formato do psycopg3 com write_row, que preserva tipos - inclusive
Decimal, sem passar por float. iter_rows percorre o DataFrame em Rust, em
vez de materializar milhões de dicionários."
```

---

## Tarefa 8: Job load com idempotência

**Arquivos:**
- Criar: `src/tcc_jobs/db/carga.py`
- Modificar: `src/tcc_jobs/cli.py`
- Teste: `tests/test_carga.py`

**Interfaces:**
- Produz: `carregar(competencias, armazenamento, engine) -> list[ResultadoCarga]`; `ResultadoCarga` com `competencia`, `inseridas: dict[str, int]`, `erro: str | None`.

A idempotência é o requisito central: reprocessar a mesma competência não pode duplicar. Como `COPY` não suporta `ON CONFLICT`, a carga usa tabela temporária mais `INSERT ... ON CONFLICT DO UPDATE`.

- [ ] **Passo 1: Escrever o teste que falha**

Arquivo `tests/test_carga.py`:

```python
from pathlib import Path

from sqlalchemy import Engine, text

from tcc_jobs.core.competencia import Competencia
from tcc_jobs.db.carga import carregar
from tcc_jobs.etl.armazenamento import Armazenamento
from tcc_jobs.etl.pipeline import ingerir

from tests.conftest import ClientePortalFalso

C = Competencia.de_str("202401")


def _silver_pronto(tmp_path: Path, zip_amostra: bytes) -> Armazenamento:
    arm = Armazenamento(tmp_path)
    ingerir([C], ClientePortalFalso(zip_amostra), arm)
    return arm


def test_carrega_dimensoes_e_fatos(sessao, engine: Engine, tmp_path: Path, zip_amostra: bytes) -> None:
    arm = _silver_pronto(tmp_path, zip_amostra)

    carregar([C], arm, engine)

    for tabela in ("modalidade", "orgao", "unidade_gestora", "fornecedor", "licitacao"):
        total = sessao.execute(text(f"SELECT count(*) FROM {tabela}")).scalar()
        assert total is not None and total > 0, f"{tabela} vazia"


def test_reprocessar_nao_duplica(sessao, engine: Engine, tmp_path: Path, zip_amostra: bytes) -> None:
    """O requisito central da ingestão."""
    arm = _silver_pronto(tmp_path, zip_amostra)

    carregar([C], arm, engine)
    antes = sessao.execute(text("SELECT count(*) FROM licitacao")).scalar()

    carregar([C], arm, engine)
    depois = sessao.execute(text("SELECT count(*) FROM licitacao")).scalar()

    assert antes == depois


def test_chave_natural_absorve_licitacao_repetida(sessao, engine: Engine, tmp_path: Path, zip_amostra: bytes) -> None:
    """Licitação aberta em dezembro reaparece na competência de janeiro."""
    arm = _silver_pronto(tmp_path, zip_amostra)
    carregar([C], arm, engine)

    duplicatas = sessao.execute(
        text("""
        SELECT count(*) FROM (
            SELECT numero_licitacao, codigo_ug, codigo_modalidade
            FROM licitacao
            GROUP BY 1, 2, 3 HAVING count(*) > 1
        ) d
        """)
    ).scalar()

    assert duplicatas == 0


def test_itens_e_participantes_referenciam_licitacao(sessao, engine: Engine, tmp_path: Path, zip_amostra: bytes) -> None:
    arm = _silver_pronto(tmp_path, zip_amostra)

    carregar([C], arm, engine)

    orfaos = sessao.execute(
        text("""
        SELECT count(*) FROM participante_licitacao p
        LEFT JOIN licitacao l ON l.id = p.licitacao_id
        WHERE l.id IS NULL
        """)
    ).scalar()
    assert orfaos == 0


def test_relata_linhas_inseridas(sessao, engine: Engine, tmp_path: Path, zip_amostra: bytes) -> None:
    arm = _silver_pronto(tmp_path, zip_amostra)

    resultado = carregar([C], arm, engine)[0]

    assert resultado.erro is None
    assert resultado.inseridas["licitacao"] > 0
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
docker compose exec jobs uv run pytest tests/test_carga.py -q
```

Esperado: `ModuleNotFoundError: No module named 'tcc_jobs.db.carga'`.

- [ ] **Passo 3: Implementar**

Arquivo `src/tcc_jobs/db/carga.py`:

```python
import logging
from dataclasses import dataclass, field

import polars as pl
from sqlalchemy import Engine, text

from tcc_jobs.core.competencia import Competencia
from tcc_jobs.db.copiador import copiar_para_tabela
from tcc_jobs.etl.armazenamento import Armazenamento

logger = logging.getLogger(__name__)

CHAVE_NATURAL = ["numero_licitacao", "codigo_ug", "codigo_modalidade"]


@dataclass
class ResultadoCarga:
    competencia: Competencia
    inseridas: dict[str, int] = field(default_factory=dict)
    erro: str | None = None


def carregar(
    competencias: list[Competencia],
    armazenamento: Armazenamento,
    engine: Engine,
) -> list[ResultadoCarga]:
    """Carrega silver no PostgreSQL, uma competência por transação."""
    return [_carregar_uma(c, armazenamento, engine) for c in competencias]


def _ler_silver(armazenamento: Armazenamento, c: Competencia, tabela: str) -> pl.DataFrame:
    caminho = armazenamento.caminho_silver(c, tabela)
    return pl.read_parquet(caminho) if caminho.exists() else pl.DataFrame()


def _carregar_uma(
    competencia: Competencia, armazenamento: Armazenamento, engine: Engine
) -> ResultadoCarga:
    resultado = ResultadoCarga(competencia=competencia)

    try:
        lic = _ler_silver(armazenamento, competencia, "licitacao")
        item = _ler_silver(armazenamento, competencia, "item")
        part = _ler_silver(armazenamento, competencia, "participante")

        if lic.height == 0:
            resultado.erro = "silver ausente ou vazio - rode ingest primeiro"
            return resultado

        with engine.begin() as conn:
            resultado.inseridas["modalidade"] = _carregar_modalidades(conn, lic)
            resultado.inseridas["orgao"] = _carregar_orgaos(conn, lic)
            resultado.inseridas["unidade_gestora"] = _carregar_ugs(conn, lic)
            resultado.inseridas["fornecedor"] = _carregar_fornecedores(conn, item, part)
            resultado.inseridas["licitacao"] = _carregar_licitacoes(conn, lic)
            resultado.inseridas["item"] = _carregar_filhos(conn, item, "item_licitacao")
            resultado.inseridas["participante"] = _carregar_filhos(
                conn, part, "participante_licitacao"
            )

        logger.info("load %s: %s", competencia, resultado.inseridas)

    except Exception as erro:  # noqa: BLE001 - uma competência ruim não derruba o lote
        resultado.erro = f"{type(erro).__name__}: {erro}"
        logger.exception("load %s falhou", competencia)

    return resultado


def _via_temporaria(
    conn: object,
    df: pl.DataFrame,
    tabela: str,
    colunas: list[str],
    conflito: list[str],
    atualizar: list[str],
) -> int:
    """COPY para tabela temporária, depois INSERT ... ON CONFLICT.

    COPY não suporta ON CONFLICT, e é o COPY que dá a velocidade. A temporária
    é o que conciliaeficiência com idempotência.
    """
    if df.height == 0:
        return 0

    temp = f"tmp_{tabela}"
    lista = ", ".join(f'"{c}"' for c in colunas)
    set_ = ", ".join(f'"{c}" = EXCLUDED."{c}"' for c in atualizar) or None
    acao = f"DO UPDATE SET {set_}" if set_ else "DO NOTHING"

    conn.execute(text(f'CREATE TEMP TABLE "{temp}" (LIKE "{tabela}") ON COMMIT DROP'))  # type: ignore[attr-defined]
    copiar_para_tabela(conn, temp, df, colunas)  # type: ignore[arg-type]
    resultado = conn.execute(  # type: ignore[attr-defined]
        text(f"""
        INSERT INTO "{tabela}" ({lista})
        SELECT {lista} FROM "{temp}"
        ON CONFLICT ({", ".join(f'"{c}"' for c in conflito)}) {acao}
        """)
    )
    return resultado.rowcount


def _carregar_modalidades(conn: object, lic: pl.DataFrame) -> int:
    """Precisa vir antes de licitacao: codigo_modalidade é FK."""
    df = (
        lic.select(
            pl.col("codigo_modalidade").alias("codigo"),
            pl.col("modalidade").alias("nome"),
        )
        .filter(pl.col("codigo").is_not_null())
        .unique(subset=["codigo"])
    )
    return _via_temporaria(conn, df, "modalidade", ["codigo", "nome"], ["codigo"], ["nome"])


def _carregar_orgaos(conn: object, lic: pl.DataFrame) -> int:
    """Órgãos subordinados e superiores, numa passada.

    A hierarquia é auto-relacionada e a FK é diferida, então o superior pode
    ser inserido depois do subordinado - a verificação acontece no commit.
    Os superiores entram como órgãos próprios, com o nome que o CSV traz.
    """
    subordinados = lic.select(
        pl.col("codigo_orgao").alias("codigo_orgao"),
        pl.col("nome_orgao").alias("nome"),
        pl.col("codigo_orgao_superior"),
    )
    superiores = lic.select(
        pl.col("codigo_orgao_superior").alias("codigo_orgao"),
        pl.col("nome_orgao_superior").alias("nome"),
        pl.lit(None, dtype=pl.String).alias("codigo_orgao_superior"),
    )
    df = (
        pl.concat([superiores, subordinados])  # superiores primeiro: o unique mantém o 1o
        .filter(pl.col("codigo_orgao").is_not_null())
        .unique(subset=["codigo_orgao"], keep="last")
    )
    return _via_temporaria(
        conn, df, "orgao",
        ["codigo_orgao", "nome", "codigo_orgao_superior"],
        ["codigo_orgao"], ["nome"],
    )


def _carregar_ugs(conn: object, lic: pl.DataFrame) -> int:
    """Recebe uf e municipio, que dependem da UG e não da licitação."""
    df = (
        lic.select(
            pl.col("codigo_ug"),
            pl.col("nome_ug").alias("nome"),
            pl.col("uf"),
            pl.col("municipio"),
            pl.col("codigo_orgao"),
        )
        .filter(pl.col("codigo_ug").is_not_null())
        .unique(subset=["codigo_ug"])
    )
    return _via_temporaria(
        conn, df, "unidade_gestora",
        ["codigo_ug", "nome", "uf", "municipio", "codigo_orgao"],
        ["codigo_ug"], ["nome", "uf", "municipio"],
    )


def _carregar_fornecedores(conn: object, item: pl.DataFrame, part: pl.DataFrame) -> int:
    de_item = (
        item.select(pl.col("cnpj_vencedor").alias("cnpj"), pl.col("nome_vencedor").alias("nome"))
        if item.height
        else pl.DataFrame(schema={"cnpj": pl.String, "nome": pl.String})
    )
    de_part = (
        part.select(
            pl.col("cnpj_participante").alias("cnpj"),
            pl.col("nome_participante").alias("nome"),
        )
        if part.height
        else pl.DataFrame(schema={"cnpj": pl.String, "nome": pl.String})
    )
    df = (
        pl.concat([de_item, de_part])
        .filter(pl.col("cnpj").is_not_null() & (pl.col("cnpj").str.len_chars() > 0))
        .unique(subset=["cnpj"])
    )
    return _via_temporaria(conn, df, "fornecedor", ["cnpj", "nome"], ["cnpj"], ["nome"])


def _carregar_licitacoes(conn: object, lic: pl.DataFrame) -> int:
    colunas = [
        "numero_licitacao", "codigo_ug", "codigo_modalidade",
        "numero_processo", "objeto", "situacao",
        "data_abertura", "data_resultado", "valor", "competencia",
    ]
    df = lic.select(colunas).unique(subset=CHAVE_NATURAL, keep="last")
    return _via_temporaria(
        conn, df, "licitacao", colunas, CHAVE_NATURAL,
        ["situacao", "valor", "data_resultado"],
    )


def _carregar_filhos(conn: object, df: pl.DataFrame, tabela: str) -> int:
    """Itens e participantes: resolve licitacao_id pela chave natural.

    Substitui as três colunas da chave pelo id, com um JOIN em SQL - sem
    trazer as licitações para a memória do Python.
    """
    if df.height == 0:
        return 0

    temp = f"tmp_{tabela}"
    conn.execute(  # type: ignore[attr-defined]
        text(f"""
        CREATE TEMP TABLE "{temp}" (
            numero_licitacao text, codigo_ug text, codigo_modalidade int,
            LIKE "{tabela}" EXCLUDING ALL
        ) ON COMMIT DROP
        """)
    )
    copiar_para_tabela(conn, temp, df, list(df.columns))  # type: ignore[arg-type]

    outras = [c for c in df.columns if c not in CHAVE_NATURAL]
    lista = ", ".join(f'"{c}"' for c in outras)
    resultado = conn.execute(  # type: ignore[attr-defined]
        text(f"""
        INSERT INTO "{tabela}" (licitacao_id, {lista})
        SELECT l.id, {", ".join(f't."{c}"' for c in outras)}
        FROM "{temp}" t
        JOIN licitacao l
          ON l.numero_licitacao = t.numero_licitacao
         AND l.codigo_ug = t.codigo_ug
         AND l.codigo_modalidade = t.codigo_modalidade
        """)
    )
    return resultado.rowcount
```

> **Atenção ao esquema normalizado:** `licitacao` não tem mais `modalidade`, `uf` nem `municipio`, e `orgao` não tem `nome_orgao_superior`. A carga precisa popular `modalidade` **antes** de `licitacao` (é FK), e a hierarquia de órgãos funciona porque a FK é diferida - o superior pode ser inserido depois do subordinado, dentro da mesma transação.

> A carga de itens e participantes **apaga e reinsere** por competência em vez de fazer upsert: eles não têm chave natural própria, e um `DELETE` pela licitação seguido de `INSERT` é mais simples e mais rápido que tentar casar linha a linha. Ajuste no passo seguinte se o teste de idempotência acusar duplicata.

- [ ] **Passo 4: Rodar e ajustar até passar**

```bash
docker compose exec jobs uv run pytest tests/test_carga.py -v
```

Se `test_reprocessar_nao_duplica` falhar para itens ou participantes, acrescentar em `_carregar_filhos`, antes do `INSERT`:

```python
    conn.execute(  # type: ignore[attr-defined]
        text(f"""
        DELETE FROM "{tabela}" WHERE licitacao_id IN (
            SELECT l.id FROM "{temp}" t
            JOIN licitacao l
              ON l.numero_licitacao = t.numero_licitacao
             AND l.codigo_ug = t.codigo_ug
             AND l.codigo_modalidade = t.codigo_modalidade
        )
        """)
    )
```

Esperado ao final: 5 passed.

- [ ] **Passo 5: Ligar na CLI**

```python
@app.command()
def load(
    de: str = typer.Option(..., help="Competência inicial, AAAAMM"),
    ate: str = typer.Option(..., help="Competência final, AAAAMM"),
) -> None:
    """Carrega silver no PostgreSQL via COPY."""
    from tcc_jobs.core.config import settings
    from tcc_jobs.db.carga import carregar
    from tcc_jobs.db.session import criar_engine
    from tcc_jobs.etl.armazenamento import Armazenamento

    competencias = _intervalo(de, ate)
    resultados = carregar(
        competencias, Armazenamento(settings.data_dir), criar_engine(settings.database_url)
    )

    com_erro = [r for r in resultados if r.erro]
    typer.echo(f"{len(resultados) - len(com_erro)} competências carregadas")
    for r in com_erro:
        typer.echo(f"  {r.competencia}: {r.erro}", err=True)
```

- [ ] **Passo 6: Verificar com dado real**

```bash
docker compose exec jobs uv run alembic upgrade head
docker compose exec jobs uv run tcc load --de 202401 --ate 202401
docker compose exec jobs uv run tcc load --de 202401 --ate 202401   # segunda vez
docker compose exec postgres psql -U tcc -d tcc -c "
SELECT 'licitacao' t, count(*) FROM licitacao
UNION ALL SELECT 'item', count(*) FROM item_licitacao
UNION ALL SELECT 'participante', count(*) FROM participante_licitacao;"
```

Esperado: as contagens **iguais** depois da segunda carga. É a prova de idempotência com dado real.

- [ ] **Passo 7: Commit**

```bash
git add src/tcc_jobs/db/carga.py src/tcc_jobs/cli.py tests/test_carga.py
git commit -m "feat: job load idempotente

COPY não suporta ON CONFLICT, e é o COPY que dá a velocidade. A carga usa
tabela temporária e depois INSERT ... ON CONFLICT, conciliando as duas
coisas.

Itens e participantes resolvem licitacao_id por JOIN em SQL contra a chave
natural, sem trazer as licitações para a memória do Python."
```

---

## Tarefa 9: Registro de ingestão

**Arquivos:**
- Modificar: `src/tcc_jobs/db/carga.py`
- Modificar: `src/tcc_jobs/etl/pipeline.py`
- Criar: `src/tcc_jobs/db/log_ingestao.py`
- Teste: `tests/test_log_ingestao.py`

**Interfaces:**
- Produz: `registrar(engine, competencia, arquivo, lidas, inseridas, atualizadas, rejeitadas, iniciado_em, finalizado_em, status, mensagem_erro) -> None`; `ultima_ingestao(engine) -> dict | None`.

Atende ao RF10. A API expõe isso em `/health`.

- [ ] **Passo 1: Escrever o teste que falha**

Arquivo `tests/test_log_ingestao.py`:

```python
from datetime import datetime

from sqlalchemy import Engine

from tcc_jobs.core.competencia import Competencia
from tcc_jobs.db.log_ingestao import registrar, ultima_ingestao

C = Competencia.de_str("202401")


def test_registra_e_recupera(sessao, engine: Engine) -> None:
    registrar(
        engine,
        competencia=C,
        arquivo="202401_Licitação.csv",
        lidas=2537,
        inseridas=2500,
        atualizadas=37,
        rejeitadas=0,
        iniciado_em=datetime(2026, 8, 3, 10, 0),
        finalizado_em=datetime(2026, 8, 3, 10, 2),
        status="sucesso",
    )

    ultima = ultima_ingestao(engine)
    assert ultima is not None
    assert ultima["competencia"] == "202401"
    assert ultima["linhas_lidas"] == 2537
    assert ultima["status"] == "sucesso"


def test_sem_registro_devolve_none(sessao, engine: Engine) -> None:
    assert ultima_ingestao(engine) is None


def test_registra_falha_com_mensagem(sessao, engine: Engine) -> None:
    registrar(
        engine,
        competencia=Competencia.de_str("202405"),
        arquivo="-",
        lidas=0,
        inseridas=0,
        atualizadas=0,
        rejeitadas=0,
        iniciado_em=datetime(2026, 8, 3, 10, 0),
        finalizado_em=datetime(2026, 8, 3, 10, 0),
        status="erro",
        mensagem_erro="403: competência indisponível",
    )

    ultima = ultima_ingestao(engine)
    assert ultima is not None
    assert ultima["status"] == "erro"
    assert "403" in ultima["mensagem_erro"]


def test_ultima_e_a_mais_recente(sessao, engine: Engine) -> None:
    for comp, quando in (("202401", 10), ("202402", 11)):
        registrar(
            engine,
            competencia=Competencia.de_str(comp),
            arquivo="x",
            lidas=1,
            inseridas=1,
            atualizadas=0,
            rejeitadas=0,
            iniciado_em=datetime(2026, 8, 3, quando, 0),
            finalizado_em=datetime(2026, 8, 3, quando, 5),
            status="sucesso",
        )

    ultima = ultima_ingestao(engine)
    assert ultima is not None
    assert ultima["competencia"] == "202402"
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
docker compose exec jobs uv run pytest tests/test_log_ingestao.py -q
```

- [ ] **Passo 3: Implementar**

Arquivo `src/tcc_jobs/db/log_ingestao.py`:

```python
from datetime import datetime
from typing import Any

from sqlalchemy import Engine, select

from tcc_jobs.core.competencia import Competencia
from tcc_jobs.db.models import IngestaoLog
from tcc_jobs.db.session import criar_sessionmaker


def registrar(
    engine: Engine,
    *,
    competencia: Competencia,
    arquivo: str,
    lidas: int,
    inseridas: int,
    atualizadas: int,
    rejeitadas: int,
    iniciado_em: datetime,
    finalizado_em: datetime,
    status: str,
    mensagem_erro: str | None = None,
) -> None:
    """Grava uma linha em ingestao_log. Atende ao RF10.

    Aqui o ORM é adequado: são poucas linhas por execução, e a clareza vale
    mais que o desempenho.
    """
    with criar_sessionmaker(engine)() as sessao:
        sessao.add(
            IngestaoLog(
                competencia=str(competencia),
                arquivo=arquivo,
                linhas_lidas=lidas,
                linhas_inseridas=inseridas,
                linhas_atualizadas=atualizadas,
                linhas_rejeitadas=rejeitadas,
                iniciado_em=iniciado_em,
                finalizado_em=finalizado_em,
                status=status,
                mensagem_erro=mensagem_erro,
            )
        )
        sessao.commit()


def ultima_ingestao(engine: Engine) -> dict[str, Any] | None:
    """Ingestão mais recente, para o endpoint de health da API."""
    with criar_sessionmaker(engine)() as sessao:
        log = sessao.scalars(
            select(IngestaoLog).order_by(IngestaoLog.finalizado_em.desc()).limit(1)
        ).first()

        if log is None:
            return None

        return {
            "competencia": log.competencia,
            "arquivo": log.arquivo,
            "linhas_lidas": log.linhas_lidas,
            "linhas_inseridas": log.linhas_inseridas,
            "linhas_atualizadas": log.linhas_atualizadas,
            "linhas_rejeitadas": log.linhas_rejeitadas,
            "status": log.status,
            "mensagem_erro": log.mensagem_erro,
            "finalizado_em": log.finalizado_em.isoformat() if log.finalizado_em else None,
        }
```

- [ ] **Passo 4: Rodar e ver passar**

Esperado: 4 passed.

- [ ] **Passo 5: Chamar do job load**

Em `src/tcc_jobs/db/carga.py`, envolver `_carregar_uma` com a marcação de tempo e o registro:

```python
def _carregar_uma(
    competencia: Competencia, armazenamento: Armazenamento, engine: Engine
) -> ResultadoCarga:
    from datetime import UTC, datetime

    from tcc_jobs.db.log_ingestao import registrar

    iniciado = datetime.now(UTC).replace(tzinfo=None)
    resultado = ResultadoCarga(competencia=competencia)

    # ... corpo existente ...

    registrar(
        engine,
        competencia=competencia,
        arquivo=f"{competencia}_silver",
        lidas=sum(resultado.inseridas.values()),
        inseridas=resultado.inseridas.get("licitacao", 0),
        atualizadas=0,
        rejeitadas=0,
        iniciado_em=iniciado,
        finalizado_em=datetime.now(UTC).replace(tzinfo=None),
        status="erro" if resultado.erro else "sucesso",
        mensagem_erro=resultado.erro,
    )
    return resultado
```

- [ ] **Passo 6: Commit**

```bash
git add src/tcc_jobs/db/log_ingestao.py src/tcc_jobs/db/carga.py tests/test_log_ingestao.py
git commit -m "feat: registro de ingestão em ingestao_log

Atende ao RF10. Aqui o ORM é adequado: são poucas linhas por execução, e a
clareza vale mais que o desempenho.

ultima_ingestao existe para o endpoint de health da API expor o estado da
carga - a API não executa job, mas precisa saber quando o último rodou."

Closes #8
```

---

## Tarefa 10: Job aggregate

**Arquivos:**
- Criar: `src/tcc_jobs/etl/agregacao.py`
- Modificar: `src/tcc_jobs/cli.py`
- Modificar: `.importlinter`
- Teste: `tests/test_agregacao.py`

**Interfaces:**
- Produz: `serie_mensal(lf: pl.LazyFrame) -> pl.LazyFrame` (núcleo puro); `agregar(engine) -> int` (casca).

O núcleo recebe `LazyFrame` e devolve `LazyFrame` - sem `collect()` no meio, para o motor otimizar o encadeamento inteiro.

- [ ] **Passo 1: Escrever o teste que falha**

Arquivo `tests/test_agregacao.py`:

```python
from decimal import Decimal

import polars as pl

from tcc_jobs.etl.agregacao import serie_mensal


def _entrada() -> pl.LazyFrame:
    return pl.LazyFrame(
        {
            "competencia": ["202401", "202401", "202401", "202402"],
            "codigo_orgao": ["22000", "22000", "26000", "22000"],
            "codigo_modalidade": [5, 5, 8, 5],
            "valor": [
                Decimal("100.0000"),
                Decimal("300.0000"),
                Decimal("50.0000"),
                Decimal("200.0000"),
            ],
        }
    )


def test_agrupa_por_competencia_orgao_e_modalidade() -> None:
    resultado = serie_mensal(_entrada()).collect().sort(
        ["competencia", "codigo_orgao", "codigo_modalidade"]
    )

    assert resultado.height == 3


def test_conta_e_soma() -> None:
    resultado = serie_mensal(_entrada()).collect()
    linha = resultado.filter(
        (pl.col("competencia") == "202401") & (pl.col("codigo_orgao") == "22000")
    )

    assert linha["quantidade_licitacoes"][0] == 2
    assert linha["valor_total"][0] == Decimal("400.0000")


def test_calcula_mediana() -> None:
    resultado = serie_mensal(_entrada()).collect()
    linha = resultado.filter(
        (pl.col("competencia") == "202401") & (pl.col("codigo_orgao") == "22000")
    )

    assert linha["valor_mediano"][0] == Decimal("200.0000")


def test_devolve_lazyframe_sem_materializar() -> None:
    """O ganho do Polars vem da avaliação lazy: o núcleo não chama collect."""
    assert isinstance(serie_mensal(_entrada()), pl.LazyFrame)


def test_ignora_valor_nulo_na_soma() -> None:
    entrada = pl.LazyFrame(
        {
            "competencia": ["202401", "202401"],
            "codigo_orgao": ["22000", "22000"],
            "codigo_modalidade": [5, 5],
            "valor": [Decimal("100.0000"), None],
        }
    )

    resultado = serie_mensal(entrada).collect()

    assert resultado["quantidade_licitacoes"][0] == 2
    assert resultado["valor_total"][0] == Decimal("100.0000")
```

- [ ] **Passo 2: Rodar e ver falhar**

```bash
docker compose exec jobs uv run pytest tests/test_agregacao.py -q
```

- [ ] **Passo 3: Implementar**

Arquivo `src/tcc_jobs/etl/agregacao.py`:

```python
import polars as pl

COLUNAS_SERIE = [
    "competencia",
    "codigo_orgao",
    "codigo_modalidade",
    "quantidade_licitacoes",
    "valor_total",
    "valor_mediano",
]


def serie_mensal(lf: pl.LazyFrame) -> pl.LazyFrame:
    """Agrega licitações por competência, órgão e modalidade.

    Núcleo puro: recebe LazyFrame e devolve LazyFrame, sem collect. É isso que
    permite ao motor enxergar o encadeamento inteiro e otimizar - projetando
    apenas as colunas usadas e empurrando filtros para a leitura.
    """
    return lf.group_by(["competencia", "codigo_orgao", "codigo_modalidade"]).agg(
        pl.len().alias("quantidade_licitacoes"),
        pl.col("valor").sum().alias("valor_total"),
        pl.col("valor").median().cast(pl.Decimal(18, 4)).alias("valor_mediano"),
    )
```

- [ ] **Passo 4: Rodar e ver passar**

Esperado: 5 passed.

- [ ] **Passo 5: Implementar a casca, em módulo separado**

A casca vai para `src/tcc_jobs/db/agregacao_carga.py`, **não** para `etl/agregacao.py`. Se `agregar` ficasse junto do núcleo, o módulo importaria `db.copiador` e violaria o contrato de pureza - o `import-linter` acusaria, e com razão.

```python
import logging

import polars as pl
from sqlalchemy import Engine, text

from tcc_jobs.db.copiador import copiar_para_tabela
from tcc_jobs.etl.agregacao import COLUNAS_SERIE, serie_mensal

logger = logging.getLogger(__name__)


def agregar(engine: Engine) -> int:
    """Recalcula serie_mensal a partir de licitacao.

    Lê do banco em vez de silver: o banco já tem as duplicatas resolvidas pela
    chave natural, e silver não.
    """
    with engine.begin() as conn:
        df = pl.read_database(
            "SELECT competencia, codigo_orgao, codigo_modalidade, valor FROM licitacao "
            "JOIN unidade_gestora USING (codigo_ug)",
            connection=conn,
        )

        agregado = serie_mensal(df.lazy()).collect()

        conn.execute(text("TRUNCATE serie_mensal"))
        total = copiar_para_tabela(conn, "serie_mensal", agregado, COLUNAS_SERIE)

    logger.info("aggregate: %d linhas em serie_mensal", total)
    return total
```

E na CLI:

```python
@app.command()
def aggregate() -> None:
    """Monta serie_mensal e a matriz de atributos."""
    from tcc_jobs.core.config import settings
    from tcc_jobs.db.agregacao_carga import agregar
    from tcc_jobs.db.session import criar_engine

    total = agregar(criar_engine(settings.database_url))
    typer.echo(f"serie_mensal: {total} linhas")
```

- [ ] **Passo 6: Registrar o contrato**

Com a separação do passo anterior, `etl/agregacao.py` é puro e entra no contrato do núcleo:

```ini
[importlinter:contract:nucleo-etl-e-puro]
source_modules =
    tcc_jobs.etl.parsers
    tcc_jobs.etl.agregacao
forbidden_modules =
    tcc_jobs.db
    tcc_jobs.portal
    tcc_jobs.cli
```

```bash
docker compose exec jobs uv run lint-imports
```

- [ ] **Passo 7: Commit**

```bash
git add src/tcc_jobs/etl/agregacao.py src/tcc_jobs/db/agregacao_carga.py src/tcc_jobs/cli.py tests/test_agregacao.py .importlinter
git commit -m "feat: job aggregate com serie_mensal

O núcleo recebe LazyFrame e devolve LazyFrame, sem collect: é isso que
permite ao motor otimizar o encadeamento inteiro.

Lê do banco em vez de silver porque o banco já tem as duplicatas resolvidas
pela chave natural."
```

---

## Tarefa 11: Carga completa e medição do orçamento

**Arquivos:** nenhum. É execução e medição.

- [ ] **Passo 1: Ingestão completa**

São 136 competências e alguns GB de download. Rode em segundo plano e acompanhe:

```bash
time docker compose exec -T jobs uv run tcc ingest --de 201301 --ate 202404 2>&1 | tail -20
```

Esperado: as 136 competências processadas. Se alguma falhar por rede, rode o mesmo comando de novo - o cache em bronze evita rebaixar o que já veio.

- [ ] **Passo 2: Conferir a janela documentada**

```bash
docker compose exec jobs uv run tcc ingest --de 202405 --ate 202406
```

Esperado: as duas relatadas como indisponíveis, sem quebrar o comando. Confirma o `403` documentado em [[Licitações - Fontes de Dados Públicos]].

- [ ] **Passo 3: Medir o silver**

```bash
docker compose exec jobs sh -c "du -sh /data/bronze /data/silver; du -sh /data/silver/*"
```

Registre os números: a razão entre bronze (ZIP) e silver (Parquet) é dado para a monografia.

- [ ] **Passo 4: Carga completa**

```bash
docker compose exec jobs uv run alembic upgrade head
time docker compose exec -T jobs uv run tcc load --de 201301 --ate 202404 2>&1 | tail -20
```

- [ ] **Passo 5: Conferir contra o volume estimado**

```bash
docker compose exec postgres psql -U tcc -d tcc -c "
SELECT 'orgao' t, count(*) FROM orgao
UNION ALL SELECT 'unidade_gestora', count(*) FROM unidade_gestora
UNION ALL SELECT 'fornecedor', count(*) FROM fornecedor
UNION ALL SELECT 'licitacao', count(*) FROM licitacao
UNION ALL SELECT 'item_licitacao', count(*) FROM item_licitacao
UNION ALL SELECT 'participante_licitacao', count(*) FROM participante_licitacao
ORDER BY 2 DESC;"
```

Esperado, pela estimativa em [[Licitações - Fontes de Dados Públicos]]: ~342 mil licitações, ~7 milhões de itens, ~74,8 milhões de participantes. Divergência grande é sinal de erro no ETL, não de estimativa ruim - investigue antes de seguir.

- [ ] **Passo 6: Agregar e conferir a série**

```bash
docker compose exec jobs uv run tcc aggregate
docker compose exec postgres psql -U tcc -d tcc -c "
SELECT competencia, sum(quantidade_licitacoes) qtd
FROM serie_mensal GROUP BY 1 ORDER BY 1 LIMIT 5;"
docker compose exec postgres psql -U tcc -d tcc -c "
SELECT competencia, sum(quantidade_licitacoes) qtd
FROM serie_mensal GROUP BY 1 ORDER BY 1 DESC LIMIT 3;"
```

**Atenção à última competência:** `202404` deve aparecer com volume claramente menor - o arquivo vem truncado. Confirme e registre, porque a série temporal vai interpretar isso como queda real se não for tratado no Plano 04.

- [ ] **Passo 7: Comparar com o orçamento**

| Operação | Alvo | Medido |
|---|---|---|
| `ingest` completo | < 30 min | |
| `load` completo | < 15 min | |
| `aggregate` | < 5 min | |
| Total | < 45 min | |

Se algum alvo furar, o suspeito primário está em [[Licitações - Arquitetura do Sistema]], seção "onde não desacoplar" - abstração indevida no caminho quente.

- [ ] **Passo 8: Suíte completa e commit da medição**

```bash
cd ../tcc-infra && make check
```

Registre os números medidos em [[Licitações - Pipeline de Dados]].

---

## Critério de conclusão

- [ ] `uv run tcc ingest --de 201301 --ate 202404` processa 136 competências
- [ ] `202405` em diante é relatado como indisponível, sem quebrar
- [ ] `uv run tcc load` carrega, e rodar duas vezes **não duplica** nada
- [ ] Contagens dentro da ordem de grandeza estimada
- [ ] `uv run tcc aggregate` popula `serie_mensal`
- [ ] `ingestao_log` tem uma linha por competência carregada
- [ ] Orçamento de tempo respeitado, com números registrados
- [ ] `make check` verde: testes, Pyright strict, contratos de arquitetura
- [ ] Cobertura de `etl/` acima de 80%
- [ ] `data/` não versionado: `git status --short` limpo

## Próximo plano

Com a base carregada, segue o **Plano 03 - API** (semana 6): endpoints de consulta e análise histórica em Laravel, com `openapi.json` versionado. As tabelas já existem e têm dados reais, então os testes de contrato passam a ter substância.
