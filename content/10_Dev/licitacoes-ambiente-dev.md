---
title: "Licitações - Ambiente de Desenvolvimento"
type: note
tags: [tcc, licitacoes, docker, wsl, ambiente]
created: "2026-08-03"
status: ready
---

Ambiente de desenvolvimento do [[TCC - Sistema Inteligente para Licitações]] e as armadilhas encontradas ao montá-lo. Registradas porque várias voltam a acontecer, e nenhuma tem mensagem de erro que aponte a causa.

## Container-first

O host precisa **apenas de Docker**. PHP, Composer e as dependências de cada stack vivem só nas imagens.

Isso elimina a classe de erro mais comum em desenvolvimento poliglota - versão divergente entre a máquina e o container - e torna verdadeira a promessa de clonar e rodar, que é critério de sucesso do projeto.

| No host | Nos containers |
|---|---|
| Docker | PHP 8.4.24, Composer |
| Node (opcional) | Python 3.14.6, uv |
| Python (opcional) | Node 24.18.1, npm |

**Critério de versão:** a mais recente que as dependências críticas suportam, verificado antes de subir. Python não tem LTS formal, então vale a mais recente estável (3.14, suporte até 2030). Node tem, e a escolha é a **LTS ativa** - Node 26 já existe, mas só entra em LTS em out/2026, e o Angular 22 declara `engines: ^22.22.3 || ^24.15.0 || >=26.0.0`.

### Como funciona

Cada Dockerfile é multi-stage, com estágios `dev` e `prod`:

- **`dev`** não copia código: ele chega por **bind mount**. As dependências ficam em **volume nomeado**, fora do repositório.
- **`prod`** embute o código e descarta ferramentas de desenvolvimento.

O serviço `jobs` fica de pé com `sleep infinity` para aceitar `docker compose exec`, que é instantâneo. Com `docker compose run`, cada ciclo de teste criaria um container novo - inviável numa fase com dezenas de execuções.

```bash
export COMPOSE_FILE=$HOME/dev/TCC/tcc-infra/docker-compose.yml
docker compose exec jobs uv run pytest
docker compose exec api ./vendor/bin/phpunit
```

Definir `COMPOSE_FILE` no shell permite rodar de qualquer diretório, sem `-f`.

## Armadilhas

### VPN quebra Docker e apt

**Sintoma:** `apt update` falha com `Temporary failure resolving`; `docker pull` falha com `TLS handshake timeout`. Mensagens que sugerem DNS, mas o DNS está bom.

**Causa:** a VPN Surfshark cria uma rota IPv6 padrão apontando para um endereço ULA (`fdbe:...`, faixa `fc00::/7`), que **não é roteável na internet**. Todo tráfego IPv6 é capturado e morre ali. Ferramentas que preferem IPv6 falham; `curl` funciona porque faz fallback para IPv4.

**Diagnóstico:**

```bash
ip -6 route show default          # aponta para surfshark_ipv6?
curl -6 -sI https://registry-1.docker.io/v2/   # falha
curl -4 -sI https://registry-1.docker.io/v2/   # funciona
```

**Solução:** desconectar a VPN, ou desabilitar IPv6 no WSL:

```bash
printf 'net.ipv6.conf.all.disable_ipv6=1\nnet.ipv6.conf.default.disable_ipv6=1\n' \
  | sudo tee /etc/sysctl.d/99-disable-ipv6.conf && sudo sysctl --system
```

Para o `apt` isoladamente, `Acquire::ForceIPv4 "true"` resolve. Não serve para o Docker: o daemon é escrito em Go e não respeita essa configuração.

### Container como root deixa arquivos intocáveis

**Sintoma:** `PermissionError` ou `EACCES` ao editar arquivos que o container gerou. Acontece com migration do `alembic revision`, `dist/`, `.angular/`, `package-lock.json`, cache do pytest.

**Causa:** o container roda como root por padrão. Pelo bind mount, tudo que ele cria nasce como root na pasta do host.

**Solução:** cada Dockerfile cria usuário com o UID do host, recebido por `ARG UID`/`ARG GID` a partir do compose. Ao corrigir depois do fato, o `chown` precisa rodar dentro do container como root:

```bash
docker compose exec -u root <serviço> chown -R 1000:1000 <caminho>
```

Atenção aos **volumes nomeados**: se foram criados quando o container era root, pertencem a root mesmo depois da correção. `/opt/venv`, `vendor/` e `node_modules/` precisaram de `chown` explícito.

### Volume vazio derruba o container antes de instalar

**Sintoma:** o container da API morre com `Failed opening required vendor/autoload.php`; o do frontend não encontra `@angular/cli`.

**Causa:** `vendor/` e `node_modules/` são volumes nomeados e nascem vazios. O comando de inicialização tenta rodar antes de haver dependências - ovo e galinha.

**Solução:** guarda no `CMD` do estágio `dev`:

```dockerfile
CMD ["sh", "-c", "[ -f vendor/autoload.php ] || composer install --no-interaction; php artisan serve --host=0.0.0.0"]
```

### venv dentro do bind mount contamina o host

O `uv` cria `.venv` no diretório do projeto por padrão. Com bind mount, isso grava binários Linux do container na pasta do host, misturando com o que exista no WSL.

**Solução:** `UV_PROJECT_ENVIRONMENT=/opt/venv` no Dockerfile, movendo o ambiente para fora de `/app`.

### Hot reload não dispara no WSL

A notificação de mudança de arquivo do inotify não atravessa de forma confiável o limite entre WSL e container. O `ng serve` precisa de polling explícito:

```dockerfile
CMD ["sh", "-c", "npm start -- --host 0.0.0.0 --poll 1000"]
```

PHP é interpretado, então não precisa de nada equivalente.

### Pyright falha na imagem slim

**Sintoma:** `libatomic.so.1: cannot open shared object file`.

**Causa:** o Pyright baixa o próprio Node, que não roda na imagem `python:*-slim` sem essa biblioteca.

**Solução:** `apt-get install libatomic1` no estágio `dev`.

### Imagem de produção levando dependências de desenvolvimento

**Sintoma:** imagem PHP com 1 GB.

**Causa:** sem `.dockerignore`, o `COPY . .` levava o `vendor/` do host (93 MB, com pacotes de desenvolvimento) **por cima** do `vendor` instalado com `--no-dev`. O flag estava sendo silenciosamente anulado.

Somado a isso, `postgresql-dev` arrasta o toolchain de compilação inteiro.

**Solução:** `.dockerignore` nos três repositórios, e dependências de build virtuais:

```dockerfile
RUN apk add --no-cache --virtual .build-deps postgresql-dev \
    && docker-php-ext-install pdo pdo_pgsql \
    && apk add --no-cache libpq \
    && apk del .build-deps
```

Resultado: de 1.04 GB para 230 MB.

### Volume nomeado herda o owner do ponto de montagem

**Sintoma:** após recriar um volume, `npm install` falha com `EACCES` mesmo com o container rodando como usuário não-root.

**Causa:** ao criar um volume nomeado, o Docker copia o ownership do diretório correspondente **na imagem**. Se `/app/node_modules` não existe na imagem, o volume nasce como root.

**Solução:** criar o diretório na imagem, com o owner correto, antes do `USER`:

```dockerfile
RUN mkdir -p /app/node_modules && chown -R "$UID:$GID" /app
```

### CI falha por rede, não por código

`docker build` no runner depende do Docker Hub e ocasionalmente falha com `i/o timeout` em `registry-1.docker.io`. Não é bug do projeto: reexecutar resolve (`gh run rerun <id> --failed`). Vale conferir a mensagem antes de sair caçando causa no código.

### Ferramentas mudam sob os pés

Três surpresas em ferramentas recentes:

- **O Angular trocou Karma por Vitest.** A flag `--browsers` não existe mais; `npm test -- --watch=false` é o comando.
- **ESLint não vem por padrão** no Angular CLI atual. Precisa de `ng add @angular-eslint/schematics`.
- **`composer create-project` roda na imagem `composer:2`, que traz PHP 8.4** e gera lock exigindo `>= 8.4.1`. Se o runtime for 8.3, o install falha. A imagem que cria o projeto e a que o executa precisam bater.

### Projeto criado em subpasta carrega o nome errado

`composer create-project` e `ng new` exigem diretório vazio, mas o repositório já tem `README.md` e `.gitignore`. A saída é criar em subpasta e mesclar com `cp -rn`.

No Angular, o nome da subpasta **vaza para o `angular.json`**, inclusive nos campos `buildTarget`, e quebra o `ng serve`. Também muda o caminho do `dist/`, que o Dockerfile de produção referencia. Renomear exige trocar `"tmp"` e `"tmp:build:..."`.

## Verificação do ambiente

```bash
cd tcc-infra && make verify
```

Confirma os quatro serviços, o health da API com conexão ao banco, o dashboard respondendo e a contagem de tabelas.
