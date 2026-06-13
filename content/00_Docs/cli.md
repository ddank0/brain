---
title: vault CLI
type: docs
tags: [docs, cli]
created: "2026-06-13"
status: ready
---

Ferramenta de linha de comando para gerenciar o vault.

## Comandos

### `vault validate`

Valida todas as notas contra o schema.

```bash
vault validate          # valida tudo
vault validate --strict # falha em warnings também (usado no CI)
```

Verifica: frontmatter obrigatório, tipos válidos, formato de data, tags sem espaços.

### `vault create`

Cria uma nova nota com frontmatter preenchido.

```bash
vault create --type note
vault create --type study --open   # abre no editor após criar
vault create --type project --title "Nome do Projeto"
```

### `vault stats`

Mostra estatísticas do vault.

```bash
vault stats
vault stats --top 5   # top 5 tags
```

### `vault format`

Normaliza o frontmatter das notas.

```bash
vault format --write --path content/
```

## Instalação

```bash
cd packages/cli
npm install
npm run build
# usa como: node packages/cli/dist/index.js <comando>
```

O CI roda `vault validate --strict` antes de cada deploy.
