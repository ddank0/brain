# Astro Migration Design

Migração do site do vault de Quartz v5 para Astro, implementando o design Terminal Violet exato do brainstorm com stats strip, note list com nav tabs, two-panel layout e command palette.

---

## Goal

Substituir `packages/site` (Quartz v5) por um projeto Astro com controle total de layout, aplicando o design Terminal Violet planejado no brainstorm com todos os componentes customizados que o Quartz não suportava.

## Architecture

Astro como static site generator lendo diretamente de `content/` via Content Collections. Markdown processado por pipeline remark (wikilinks, GFM). Backlinks e stats computados em TypeScript puro no build. Vanilla JS para interatividade (tabs, command palette). Pagefind para full-text search. Deploy via GitHub Actions para GitHub Pages — mesmo destino, pipeline simplificada.

## Tech Stack

- **Astro 6** (6.4.6, node >=22.12.0) — SSG, Content Layer API com `glob()` loader, roteamento baseado em arquivo
- **remark-wiki-link** — resolução de `[[wikilinks]]` em links HTML
- **remark-gfm** — tabelas, task lists, strikethrough
- **rehype-slug + rehype-autolink-headings** — âncoras nos headings
- **Pagefind** — full-text search estático (gerado no build)
- **Vanilla JS** — command palette ⌘K, tabs de filtro
- **CSS puro** — design tokens Terminal Violet em variáveis CSS

---

## Repository Structure

```
brain/
├── content/                          # vault Obsidian (não muda)
│   ├── 10_Dev/
│   ├── 20_Projects/
│   ├── 30_Studies/
│   ├── 50_Ideas/
│   ├── 90_Archive/
│   └── index.md
├── packages/
│   ├── cli/                          # não muda
│   └── site/                         # SUBSTITUÍDO — projeto Astro
│       ├── src/
│       │   ├── components/
│       │   │   ├── Header.astro      # topbar: logo + tabs + ⌘K
│       │   │   ├── NoteList.astro    # lista de notas com filtro por tab
│       │   │   ├── NoteCard.astro    # linha: idx · type · título · data
│       │   │   ├── StatsStrip.astro  # total · projetos · estudos · links
│       │   │   ├── Backlinks.astro   # seção de backlinks na nota
│       │   │   └── CommandPalette.astro  # modal ⌘K com Pagefind
│       │   ├── layouts/
│       │   │   ├── BaseLayout.astro  # html, head, estilos, scripts globais
│       │   │   └── NoteLayout.astro  # breadcrumb + H1 + tags + meta + slot
│       │   ├── pages/
│       │   │   ├── index.astro       # homepage
│       │   │   ├── [...slug].astro   # nota individual
│       │   │   └── tags/
│       │   │       └── [tag].astro   # notas por tag
│       │   ├── lib/
│       │   │   ├── backlinks.ts      # computa mapa slug → backlinks
│       │   │   ├── wikilinks.ts      # plugin remark para [[wikilinks]]
│       │   │   └── stats.ts          # conta notas, tipos, tags, links
│       │   └── styles/
│       │       └── terminal-violet.css  # todos os tokens e componentes CSS
│       ├── public/
│       ├── astro.config.mjs
│       └── package.json
├── .github/workflows/deploy.yml      # ajustado para Astro
└── package.json                      # workspace inclui packages/site
```

`packages/site-build` (clone do Quartz no CI) é removido — não existe mais localmente nem na pipeline.

---

## Content Layer

O vault fica fora do `src/` — em `content/` na raiz do monorepo. Astro 6 resolve isso com o `glob()` loader em `src/content/config.ts`:

```ts
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const vault = defineCollection({
  loader: glob({ pattern: '**/*.md', base: process.env.VAULT_PATH ?? '../../content' }),
  schema: z.object({
    title: z.string(),
    type: z.enum(['note', 'study', 'project', 'idea']),
    tags: z.array(z.string()),
    created: z.string(),
    updated: z.string().optional(),
    status: z.enum(['draft', 'ready']).optional(),
  }),
});

export const collections = { vault };
```

`VAULT_PATH` é a variável de ambiente — `../../content` em dev, `${{ github.workspace }}/content` no CI. O `getCollection('vault')` fica disponível em qualquer página Astro sem imports adicionais.

---

## Pages & Routing

### `/brain/` — Homepage (`index.astro`)

```
┌─────────────────────────────────────────────────────┐
│ vault_   all  dev  study  project    [⌘K buscar_]   │
├─────────────────────────────────────────────────────┤
│  47 notas  │  2 projetos  │  12 estudos  │  134 links│
├─────────────────────────────────────────────────────┤
│ 01  dev    Docker — Cheat Sheet completo      05-31  │
│ 02  dev    Git Workflows avançados            05-28  │
│ 03  study  Clean Code — Capítulos 4 e 5      05-25  │
│ ...                                                  │
│ vault $  _                                          │
└─────────────────────────────────────────────────────┘
```

**Dados de build:**
- `stats` gerado por `lib/stats.ts` — lê todo `content/` uma vez
- `notes` — array de todas as notas ordenadas por `created` desc
- Tabs filtram a lista via vanilla JS (sem reload de página)

### `/brain/[...slug]` — Nota individual (`[...slug].astro`)

```
┌─────────────────────────────────────────────────────┐
│ vault_   all  dev  study  project    [⌘K buscar_]   │
├─────────────────────────────────────────────────────┤
│ 10_Dev / git-workflows-avancados                     │
│                                                      │
│ Git Workflows                                        │
│ avançados                                           │
│                                                      │
│ [dev] [git] [workflow]                               │
│ created 2026-05-28 · status ready                    │
│ ──────────────────────────────────────────────────  │
│ <conteúdo markdown renderizado>                      │
│ ──────────────────────────────────────────────────  │
│ Backlinks (2)                                        │
│ ← docker-cheat-sheet                                │
│ ← typescript-advanced-types                         │
└─────────────────────────────────────────────────────┘
```

**Dados de build:**
- Slug gerado a partir do caminho relativo em `content/` (ex: `10_Dev/docker-cheat-sheet`)
- Backlinks injetados como prop pelo mapa computado em `lib/backlinks.ts`
- Breadcrumb extraído do slug (segmento anterior ao filename)

### `/brain/tags/[tag]` — Notas por tag (`tags/[tag].astro`)

Lista simples: topbar + lista de notas filtradas pela tag. Mesmo componente `NoteList` com filtro fixo. Tags geradas via `getStaticPaths` a partir de todas as tags encontradas no frontmatter.

---

## Markdown Processing Pipeline

```
content/**.md
    └── remark-gfm          — tabelas, task lists, ~~strikethrough~~
    └── remark-wiki-link    — [[nome]] → <a href="/brain/slug">nome</a>
    └── rehype-slug         — id nos headings
    └── rehype-autolink-headings  — âncora clicável nos headings
    └── HTML renderizado
```

**Resolução de wikilinks (`src/lib/wikilinks.ts`):**
- No build, monta um mapa `título → slug` e `filename → slug` de todos os arquivos em `content/`
- `remark-wiki-link` usa esse mapa para resolver `[[Docker — Cheat Sheet]]` → `/brain/10_Dev/docker-cheat-sheet`
- Links não resolvidos recebem classe `wikilink-broken` e não quebram o build

**Backlinks (`src/lib/backlinks.ts`):**
- Varre todos os `.md` extraindo `[[wikilinks]]` com regex
- Monta mapa `targetSlug → [{ slug, title }]`
- Exportado como objeto e consumido pelo `[...slug].astro` via `getStaticPaths`

**Stats (`src/lib/stats.ts`):**
- Conta total de notas (exclui `index.md`)
- Agrupa por `type` (note/study/project/idea)
- Conta ocorrências de cada tag
- Conta total de `[[wikilinks]]` em todos os arquivos (= links internos)
- Retorna objeto tipado consumido pelo `index.astro`

---

## Design System — Terminal Violet

Todos os tokens em `src/styles/terminal-violet.css`:

```css
:root {
  --tv-bg:        #07050F;
  --tv-body:      #0B0A14;
  --tv-elevated:  rgba(109, 40, 217, 0.12);
  --tv-fg:        #EDE9FF;
  --tv-fg-muted:  rgba(196, 181, 253, 0.5);
  --tv-fg-dim:    rgba(196, 181, 253, 0.25);
  --tv-accent:    #7C3AED;
  --tv-mid:       #A78BFA;
  --tv-light:     #C4B5FD;
  --tv-border:    rgba(124, 58, 237, 0.18);
  --tv-aborder:   rgba(124, 58, 237, 0.2);
  --tv-radius:    5px;
  --font-mono:    'JetBrains Mono', monospace;
}
```

**Type badges** (classes CSS, não JS):
- `type-note` — violet `rgba(124,58,237,0.15)` / `#A78BFA`
- `type-study` — blue `rgba(59,130,246,0.12)` / `#93C5FD`
- `type-project` — green `rgba(16,185,129,0.12)` / `#6EE7B7`
- `type-idea` — amber `rgba(245,158,11,0.12)` / `#FCD34D`

**Cursor blink** em `vault_` no topbar:
```css
.logo::after {
  content: '_';
  color: var(--tv-accent);
  animation: tv-blink 1.1s step-end infinite;
}
@keyframes tv-blink { 50% { opacity: 0; } }
```

---

## Interactive Components (Vanilla JS)

### Tabs de filtro

`Header.astro` renderiza as tabs. Script inline no `index.astro`:

```js
document.querySelectorAll('[data-tab]').forEach(tab => {
  tab.addEventListener('click', () => {
    const type = tab.dataset.tab;
    document.querySelectorAll('[data-tab]').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    document.querySelectorAll('[data-note-type]').forEach(row => {
      row.hidden = type !== 'all' && row.dataset.noteType !== type;
    });
  });
});
```

### Command Palette ⌘K

`CommandPalette.astro` é um `<dialog>` HTML nativo. Pagefind expõe `window.pagefind.search(query)`. Script em `src/scripts/command-palette.js`:

- `Ctrl+K` / `⌘K` → `dialog.showModal()`
- `Esc` → `dialog.close()`
- `↑↓` → navegação na lista de resultados
- `Enter` → `window.location.href` do resultado selecionado
- Input com debounce 150ms chama `pagefind.search()` e atualiza lista

---

## Search — Pagefind

Pagefind roda como pós-build (`pagefind --site dist`), indexa o HTML gerado e cria `dist/pagefind/`. No CI, a etapa de build inclui:

```bash
npm run build               # astro build
npx pagefind --site dist    # indexa
```

O `CommandPalette.astro` carrega `pagefind/pagefind.js` lazy (só quando o modal abre pela primeira vez) para não impactar o load inicial.

---

## CI/CD Pipeline

```yaml
# .github/workflows/deploy.yml

validate:
  node-version: "20"
  - npm ci (root)
  - node packages/cli/dist/index.js validate --strict

build:
  node-version: "22.12"
  - npm ci (packages/site)
  - npm run build (packages/site)         # astro build
  - npx pagefind --site packages/site/dist
  - upload-pages-artifact: packages/site/dist

deploy:
  - deploy-pages
```

Remove: clone do Quartz, `npx quartz create`, cópia de configs. A pipeline vai de ~3 min para ~1 min.

**Local dev:**
```bash
cd packages/site && npm run dev
# server em localhost:4321/brain
```

**Variável de ambiente:**
- `VAULT_PATH` — caminho absoluto para `content/`. Default em dev: `../../content` (relativo ao `packages/site`). No CI: `${{ github.workspace }}/content`.

---

## What Gets Removed

- `packages/site/quartz.config.yaml` — removido
- `packages/site/quartz/styles/custom.scss` — removido
- `packages/site-build/` — removido do `.gitignore` e do CI
- `packages/site` entry no `package.json` root não precisa de workspace (Astro tem suas próprias deps)

---

## What Stays

- `content/` — inalterado
- `packages/cli/` — inalterado
- `schemas/` — inalterado
- `lefthook.yml` — inalterado
- `plugins/` — inalterado
- Deploy target: `https://ddank0.github.io/brain` — inalterado
