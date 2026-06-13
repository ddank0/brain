---
title: Deploy e CI/CD
type: docs
tags: [docs, deploy, ci]
created: "2026-06-13"
status: ready
---

Pipeline de deploy automático para GitHub Pages.

## URL

`https://ddank0.github.io/brain`

## Pipeline

```
push → main
  └── validate    (node 20)
  │     npm ci (packages/cli)
  │     vault validate --strict
  │
  └── build       (node 22.12)
  │     npm ci (packages/site)
  │     astro build + pagefind --site dist
  │     VAULT_PATH=${{ github.workspace }}/content
  │
  └── deploy
        actions/deploy-pages
```

## Triggers

O deploy roda automaticamente quando há push em `main` afetando:
- `content/**` — novas notas ou edições
- `packages/site/**` — mudanças no site
- `schemas/**` — mudanças no schema
- `.github/workflows/**` — mudanças no CI

## Dev Local

```bash
cd packages/site
npm run dev
# → http://localhost:4321/brain
```

> A busca (⌘K) usa Pagefind, gerado só no build. Em dev, o campo abre mas não retorna resultados.

## Build Local

```bash
cd packages/site
npm run build
# gera dist/ + dist/pagefind/
npx astro preview
# → http://localhost:4321/brain (com busca funcional)
```
