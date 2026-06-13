---
title: Arquitetura do Site
type: docs
tags: [docs, astro, site]
created: "2026-06-13"
status: ready
---

Stack do site gerado a partir deste vault.

## Tech Stack

| Camada | Tecnologia |
|--------|-----------|
| SSG | Astro 6.4.6 |
| Conteúdo | Content Layer API + `glob()` loader |
| Markdown | remark-wiki-link + rehype-slug |
| Search | Pagefind (pós-build) |
| CSS | Vanilla CSS — design system Terminal Violet |
| JS | Vanilla JS — tabs + command palette |
| Deploy | GitHub Pages via GitHub Actions |

## Fluxo de Build

```
content/**/*.md
  └── glob() loader        — lê frontmatter + body
  └── remark-wiki-link     — [[wikilinks]] → <a href>
  └── rehype-slug          — id nos headings
  └── Astro SSG            — gera HTML estático
  └── Pagefind             — indexa HTML para busca
  └── dist/                — GitHub Pages
```

## Estrutura do Projeto

```
brain/
├── content/           — vault Obsidian
├── packages/
│   ├── cli/           — vault CLI (validate, create, stats)
│   └── site/          — este site (Astro)
│       └── src/
│           ├── lib/       — stats.ts, backlinks.ts, wikilinks.ts
│           ├── components/
│           ├── layouts/
│           ├── pages/
│           └── styles/
└── .github/workflows/deploy.yml
```

## Wikilinks

`[[nome da nota]]` é resolvido em build time por `src/lib/wikilinks.ts`:
- Mapeia filename e frontmatter `title` → slug
- Links não resolvidos ficam com classe `wikilink-broken`

## Backlinks

Computados em `src/lib/backlinks.ts` — varre todos os `.md` extraindo `[[wikilinks]]` e constrói o mapa `slug → [{ slug, title }]` injetado em cada página de nota.
