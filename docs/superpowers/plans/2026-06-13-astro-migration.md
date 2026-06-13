# Astro Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir `packages/site` (Quartz v5) por um projeto Astro 6 com design Terminal Violet exato, incluindo stats strip, note list com tabs, command palette ⌘K e backlinks.

**Architecture:** Astro 6 como SSG lendo `content/` via Content Layer API com `glob()` loader. Markdown processado por remark-gfm + remark-wiki-link + rehype-slug. Backlinks e stats computados em TypeScript puro no build. Vanilla JS para tabs e command palette. Pagefind para full-text search estático.

**Tech Stack:** Astro 6.4.6, remark-gfm 4.0.1, remark-wiki-link 2.0.1, rehype-slug 6.0.0, rehype-autolink-headings 7.1.0, pagefind 1.5.2, vitest 2.x, Node 22.12+

---

## File Map

```
packages/site/                         ← limpar tudo, recriar como Astro
  package.json                         CREATE
  astro.config.mjs                     CREATE
  vitest.config.ts                     CREATE
  src/
    content/
      config.ts                        CREATE  — Content Layer schema
    lib/
      stats.ts                         CREATE  — getStats(notes) → VaultStats
      stats.test.ts                    CREATE
      backlinks.ts                     CREATE  — buildBacklinksMap(notes) → map
      backlinks.test.ts                CREATE
      wikilinks.ts                     CREATE  — buildSlugMap(contentDir) → map
      wikilinks.test.ts                CREATE
    styles/
      terminal-violet.css              CREATE  — todos os tokens CSS
    layouts/
      BaseLayout.astro                 CREATE  — html shell + fonts + CSS
      NoteLayout.astro                 CREATE  — breadcrumb + H1 + tags + meta + slot
    components/
      Header.astro                     CREATE  — topbar: logo + tabs + ⌘K
      StatsStrip.astro                 CREATE  — 4 stat cards
      NoteCard.astro                   CREATE  — linha de nota: idx · type · title · date
      NoteList.astro                   CREATE  — lista de NoteCards + footer prompt
      Backlinks.astro                  CREATE  — seção de backlinks
      CommandPalette.astro             CREATE  — dialog ⌘K + script inline
    pages/
      index.astro                      CREATE  — homepage
      [...slug].astro                  CREATE  — nota individual
      tags/
        [tag].astro                    CREATE  — notas por tag
  public/                              CREATE  — vazio
.github/workflows/deploy.yml          MODIFY  — remover Quartz, usar Astro
.gitignore                             MODIFY  — remover entradas Quartz, adicionar Astro
```

**Tracked Quartz files to remove from git:**
- `packages/site/quartz.config.yaml`
- `packages/site/quartz.lock.json`
- `packages/site/quartz/styles/custom.scss`

---

## Task 1: Limpar Quartz e criar scaffold Astro

**Files:**
- Remove: `packages/site/` (inteiro)
- Create: `packages/site/package.json`
- Create: `packages/site/astro.config.mjs`
- Create: `packages/site/vitest.config.ts`
- Create: `packages/site/src/content/config.ts`
- Create: `packages/site/public/.gitkeep`

- [ ] **Step 1: Remover arquivos Quartz rastreados pelo git**

```bash
git rm packages/site/quartz.config.yaml packages/site/quartz.lock.json packages/site/quartz/styles/custom.scss
```

Saída esperada:
```
rm 'packages/site/quartz.config.yaml'
rm 'packages/site/quartz.lock.json'
rm 'packages/site/quartz/styles/custom.scss'
```

- [ ] **Step 2: Remover diretório packages/site inteiro e recriar vazio**

```bash
rm -rf packages/site
mkdir -p packages/site/src/content packages/site/src/lib packages/site/src/styles packages/site/src/layouts packages/site/src/components packages/site/src/pages/tags packages/site/public
```

- [ ] **Step 3: Criar package.json**

Criar `packages/site/package.json`:

```json
{
  "name": "@brain/site",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "astro dev",
    "build": "astro build && npx pagefind --site dist",
    "preview": "astro preview",
    "test": "vitest run"
  },
  "dependencies": {
    "astro": "^6.4.6",
    "remark-gfm": "^4.0.1",
    "remark-wiki-link": "^2.0.1",
    "rehype-slug": "^6.0.0",
    "rehype-autolink-headings": "^7.1.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "pagefind": "^1.5.2",
    "vitest": "^2.0.0",
    "typescript": "^5.4.0"
  }
}
```

- [ ] **Step 4: Criar astro.config.mjs (sem wikilinks ainda — adicionado na Task 3)**

Criar `packages/site/astro.config.mjs`:

```mjs
import { defineConfig } from 'astro/config';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';

export default defineConfig({
  base: '/brain',
  output: 'static',
  markdown: {
    remarkPlugins: [remarkGfm],
    rehypePlugins: [
      rehypeSlug,
      [rehypeAutolinkHeadings, { behavior: 'append' }],
    ],
    syntaxHighlight: 'shiki',
    shikiConfig: { theme: 'github-dark' },
  },
});
```

- [ ] **Step 5: Criar vitest.config.ts**

Criar `packages/site/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/lib/**/*.test.ts'],
  },
});
```

- [ ] **Step 6: Criar src/content/config.ts**

Criar `packages/site/src/content/config.ts`:

```ts
import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const vaultPath = process.env.VAULT_PATH ?? resolve(__dirname, '../../../content');

const vault = defineCollection({
  loader: glob({
    pattern: '**/*.md',
    base: vaultPath,
  }),
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

- [ ] **Step 7: Criar public/.gitkeep e instalar deps**

```bash
touch packages/site/public/.gitkeep
cd packages/site && npm install
```

Saída esperada: instalação sem erros, `node_modules/` criado.

- [ ] **Step 8: Verificar que o Astro inicia sem crash**

```bash
cd packages/site && npx astro check
```

Esperado: sem erros de configuração (pode ter warnings sobre páginas não existirem — ok).

- [ ] **Step 9: Commit**

```bash
git add packages/site/package.json packages/site/astro.config.mjs packages/site/vitest.config.ts packages/site/src/content/config.ts packages/site/public/.gitkeep
git commit -m "feat(site): scaffold Astro 6 — replace Quartz"
```

---

## Task 2: Build-time libs — stats.ts e backlinks.ts

**Files:**
- Create: `packages/site/src/lib/stats.ts`
- Create: `packages/site/src/lib/stats.test.ts`
- Create: `packages/site/src/lib/backlinks.ts`
- Create: `packages/site/src/lib/backlinks.test.ts`

- [ ] **Step 1: Escrever o teste para stats.ts**

Criar `packages/site/src/lib/stats.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { getStats } from './stats';

const notes = [
  { id: '10_Dev/docker', title: 'Docker', type: 'note', tags: ['dev', 'docker'], body: '[[Git Workflows]] [[Clean Code]]' },
  { id: '10_Dev/git', title: 'Git Workflows', type: 'note', tags: ['dev', 'git'], body: '' },
  { id: '30_Studies/clean-code', title: 'Clean Code', type: 'study', tags: ['book', 'dev'], body: '[[Docker]]' },
  { id: '20_Projects/vault', title: 'Vault Framework', type: 'project', tags: ['dev'], body: '[[Docker]] [[Git Workflows]]' },
];

describe('getStats', () => {
  it('conta total de notas', () => {
    expect(getStats(notes).total).toBe(4);
  });

  it('agrupa por type', () => {
    const stats = getStats(notes);
    expect(stats.byType['note']).toBe(2);
    expect(stats.byType['study']).toBe(1);
    expect(stats.byType['project']).toBe(1);
  });

  it('conta links internos (wikilinks)', () => {
    expect(getStats(notes).internalLinks).toBe(5);
  });

  it('ordena topTags por frequência', () => {
    const stats = getStats(notes);
    expect(stats.topTags[0].tag).toBe('dev');
    expect(stats.topTags[0].count).toBe(4);
  });

  it('inclui todas as tags no resultado', () => {
    const stats = getStats(notes);
    const tagNames = stats.topTags.map(t => t.tag);
    expect(tagNames).toContain('docker');
    expect(tagNames).toContain('book');
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd packages/site && npm test
```

Esperado: FAIL — `Cannot find module './stats'`

- [ ] **Step 3: Implementar stats.ts**

Criar `packages/site/src/lib/stats.ts`:

```ts
export interface NoteMeta {
  id: string;
  title: string;
  type: string;
  tags: string[];
  body: string;
}

export interface VaultStats {
  total: number;
  byType: Record<string, number>;
  topTags: Array<{ tag: string; count: number }>;
  internalLinks: number;
}

export function getStats(notes: NoteMeta[]): VaultStats {
  const total = notes.length;

  const byType: Record<string, number> = {};
  for (const note of notes) {
    byType[note.type] = (byType[note.type] ?? 0) + 1;
  }

  const tagCounts: Record<string, number> = {};
  for (const note of notes) {
    for (const tag of note.tags) {
      tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
    }
  }
  const topTags = Object.entries(tagCounts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);

  const wikilinkRegex = /\[\[[^\]]+\]\]/g;
  let internalLinks = 0;
  for (const note of notes) {
    internalLinks += (note.body.match(wikilinkRegex) ?? []).length;
  }

  return { total, byType, topTags, internalLinks };
}
```

- [ ] **Step 4: Escrever o teste para backlinks.ts**

Criar `packages/site/src/lib/backlinks.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildBacklinksMap } from './backlinks';

const notes = [
  { id: '10_Dev/docker', title: 'Docker Cheat Sheet', type: 'note', tags: [], body: '[[Git Workflows]]' },
  { id: '10_Dev/git', title: 'Git Workflows', type: 'note', tags: [], body: '[[Docker Cheat Sheet]]' },
  { id: '30_Studies/clean-code', title: 'Clean Code', type: 'study', tags: [], body: '[[Docker Cheat Sheet]] [[Git Workflows]]' },
  { id: '50_Ideas/standalone', title: 'Standalone', type: 'idea', tags: [], body: '' },
];

describe('buildBacklinksMap', () => {
  it('detecta backlinks por title match', () => {
    const map = buildBacklinksMap(notes);
    expect(map['10_Dev/docker']).toHaveLength(2);
    expect(map['10_Dev/docker'].map(b => b.slug)).toContain('10_Dev/git');
    expect(map['10_Dev/docker'].map(b => b.slug)).toContain('30_Studies/clean-code');
  });

  it('detecta backlinks para git-workflows', () => {
    const map = buildBacklinksMap(notes);
    expect(map['10_Dev/git']).toHaveLength(2);
  });

  it('retorna undefined para nota sem backlinks', () => {
    const map = buildBacklinksMap(notes);
    expect(map['50_Ideas/standalone']).toBeUndefined();
  });

  it('inclui title no backlink ref', () => {
    const map = buildBacklinksMap(notes);
    const dockerBacklinks = map['10_Dev/docker'];
    const gitRef = dockerBacklinks.find(b => b.slug === '10_Dev/git');
    expect(gitRef?.title).toBe('Git Workflows');
  });
});
```

- [ ] **Step 5: Rodar os testes e confirmar falha**

```bash
cd packages/site && npm test
```

Esperado: FAIL — `Cannot find module './backlinks'` (stats tests passam)

- [ ] **Step 6: Implementar backlinks.ts**

Criar `packages/site/src/lib/backlinks.ts`:

```ts
import type { NoteMeta } from './stats';

export interface BacklinkRef {
  slug: string;
  title: string;
}

export function buildBacklinksMap(notes: NoteMeta[]): Record<string, BacklinkRef[]> {
  const slugByKey: Record<string, string> = {};

  for (const note of notes) {
    slugByKey[note.title.toLowerCase()] = note.id;
    const filename = note.id.split('/').pop() ?? '';
    slugByKey[filename.toLowerCase()] = note.id;
  }

  const backlinks: Record<string, BacklinkRef[]> = {};
  const wikilinkRegex = /\[\[([^\]|#]+)(?:[|#][^\]]+)?\]\]/g;

  for (const note of notes) {
    for (const match of note.body.matchAll(wikilinkRegex)) {
      const ref = match[1].trim().toLowerCase();
      const targetSlug = slugByKey[ref];
      if (!targetSlug || targetSlug === note.id) continue;
      if (!backlinks[targetSlug]) backlinks[targetSlug] = [];
      const alreadyAdded = backlinks[targetSlug].some(b => b.slug === note.id);
      if (!alreadyAdded) {
        backlinks[targetSlug].push({ slug: note.id, title: note.title });
      }
    }
  }

  return backlinks;
}
```

- [ ] **Step 7: Rodar todos os testes e confirmar que passam**

```bash
cd packages/site && npm test
```

Esperado:
```
✓ src/lib/stats.test.ts (5 tests)
✓ src/lib/backlinks.test.ts (4 tests)

Test Files  2 passed (2)
Tests       9 passed (9)
```

- [ ] **Step 8: Commit**

```bash
git add packages/site/src/lib/
git commit -m "feat(site): stats e backlinks build-time libs com testes"
```

---

## Task 3: Wikilinks — buildSlugMap e integração no config

**Files:**
- Create: `packages/site/src/lib/wikilinks.ts`
- Create: `packages/site/src/lib/wikilinks.test.ts`
- Modify: `packages/site/astro.config.mjs`

- [ ] **Step 1: Escrever o teste para wikilinks.ts**

Criar `packages/site/src/lib/wikilinks.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildSlugMap } from './wikilinks';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const tmpDir = '/tmp/test-vault-wikilinks';

beforeAll(() => {
  mkdirSync(join(tmpDir, '10_Dev'), { recursive: true });
  mkdirSync(join(tmpDir, '30_Studies'), { recursive: true });
  writeFileSync(
    join(tmpDir, '10_Dev/docker-cheat-sheet.md'),
    '---\ntitle: Docker — Cheat Sheet\ntype: note\ntags: [dev]\ncreated: 2026-01-01\n---\nconteúdo'
  );
  writeFileSync(
    join(tmpDir, '10_Dev/git-workflows.md'),
    '---\ntitle: Git Workflows\ntype: note\ntags: [dev]\ncreated: 2026-01-01\n---\nconteúdo'
  );
  writeFileSync(
    join(tmpDir, '30_Studies/clean-code.md'),
    "---\ntitle: Clean Code\ntype: study\ntags: [book]\ncreated: 2026-01-01\n---\nconteúdo"
  );
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('buildSlugMap', () => {
  it('mapeia filename para slug', () => {
    const map = buildSlugMap(tmpDir);
    expect(map['docker-cheat-sheet']).toBe('10_Dev/docker-cheat-sheet');
  });

  it('mapeia title lowercase para slug', () => {
    const map = buildSlugMap(tmpDir);
    expect(map['git workflows']).toBe('10_Dev/git-workflows');
  });

  it('mapeia title com caracteres especiais', () => {
    const map = buildSlugMap(tmpDir);
    expect(map['docker — cheat sheet']).toBe('10_Dev/docker-cheat-sheet');
  });

  it('inclui arquivos de subpastas', () => {
    const map = buildSlugMap(tmpDir);
    expect(map['clean code']).toBe('30_Studies/clean-code');
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd packages/site && npm test
```

Esperado: FAIL — `Cannot find module './wikilinks'` (outros testes passam)

- [ ] **Step 3: Implementar wikilinks.ts**

Criar `packages/site/src/lib/wikilinks.ts`:

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, basename } from 'node:path';

function walk(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...walk(full));
    } else if (entry.endsWith('.md')) {
      results.push(full);
    }
  }
  return results;
}

export function buildSlugMap(contentDir: string): Record<string, string> {
  const slugMap: Record<string, string> = {};

  for (const file of walk(contentDir)) {
    const relPath = relative(contentDir, file);
    const slug = relPath.replace(/\.md$/, '');
    const filename = basename(file, '.md').toLowerCase();
    const content = readFileSync(file, 'utf-8');
    const titleMatch = content.match(/^title:\s*["']?(.+?)["']?\s*$/m);
    const title = titleMatch?.[1]?.trim().toLowerCase();

    slugMap[filename] = slug;
    if (title) slugMap[title] = slug;
  }

  return slugMap;
}
```

- [ ] **Step 4: Rodar todos os testes e confirmar que passam**

```bash
cd packages/site && npm test
```

Esperado:
```
✓ src/lib/stats.test.ts (5 tests)
✓ src/lib/backlinks.test.ts (4 tests)
✓ src/lib/wikilinks.test.ts (4 tests)

Test Files  3 passed (3)
Tests       13 passed (13)
```

- [ ] **Step 5: Integrar wikilinks no astro.config.mjs**

Substituir `packages/site/astro.config.mjs` pelo seguinte:

```mjs
import { defineConfig } from 'astro/config';
import remarkGfm from 'remark-gfm';
import remarkWikiLink from 'remark-wiki-link';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import { buildSlugMap } from './src/lib/wikilinks.ts';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const vaultPath = process.env.VAULT_PATH ?? resolve(__dirname, '../../content');
const slugMap = buildSlugMap(vaultPath);

export default defineConfig({
  base: '/brain',
  output: 'static',
  markdown: {
    remarkPlugins: [
      remarkGfm,
      [remarkWikiLink, {
        pageResolver: (name) => {
          const key = name.toLowerCase();
          return [slugMap[key] ?? name.toLowerCase().replace(/\s+/g, '-')];
        },
        hrefTemplate: (permalink) => `/brain/${permalink}`,
        wikiLinkClassName: 'wikilink',
        newClassName: 'wikilink-broken',
      }],
    ],
    rehypePlugins: [
      rehypeSlug,
      [rehypeAutolinkHeadings, { behavior: 'append' }],
    ],
    syntaxHighlight: 'shiki',
    shikiConfig: { theme: 'github-dark' },
  },
});
```

- [ ] **Step 6: Verificar que o config carrega sem erro**

```bash
cd packages/site && npx astro check
```

Esperado: sem erros de configuração.

- [ ] **Step 7: Commit**

```bash
git add packages/site/src/lib/wikilinks.ts packages/site/src/lib/wikilinks.test.ts packages/site/astro.config.mjs
git commit -m "feat(site): wikilinks buildSlugMap + integração no astro.config"
```

---

## Task 4: CSS — terminal-violet.css

**Files:**
- Create: `packages/site/src/styles/terminal-violet.css`

- [ ] **Step 1: Criar terminal-violet.css com todos os tokens e estilos**

Criar `packages/site/src/styles/terminal-violet.css`:

```css
/* ── Google Fonts ── */
@import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap');

/* ── Design tokens ── */
:root {
  --tv-bg:       #07050F;
  --tv-body:     #0B0A14;
  --tv-elevated: rgba(109, 40, 217, 0.12);
  --tv-fg:       #EDE9FF;
  --tv-fg-muted: rgba(196, 181, 253, 0.5);
  --tv-fg-dim:   rgba(196, 181, 253, 0.25);
  --tv-accent:   #7C3AED;
  --tv-mid:      #A78BFA;
  --tv-light:    #C4B5FD;
  --tv-border:   rgba(124, 58, 237, 0.18);
  --tv-aborder:  rgba(124, 58, 237, 0.2);
  --tv-radius:   5px;
  --font-mono:   'JetBrains Mono', monospace;
}

/* ── Reset + base ── */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

html, body {
  background: var(--tv-bg);
  color: var(--tv-fg);
  font-family: var(--font-mono);
  font-size: 14px;
  line-height: 1.6;
  min-height: 100vh;
}

a { color: var(--tv-mid); text-decoration: none; }
a:hover { color: var(--tv-light); text-decoration: underline; }

/* ── Topbar ── */
.topbar {
  display: flex;
  align-items: center;
  gap: 0;
  padding: 12px 24px;
  background: var(--tv-body);
  border-bottom: 1px solid var(--tv-border);
  position: sticky;
  top: 0;
  z-index: 100;
}

.logo {
  color: var(--tv-fg);
  font-weight: 600;
  font-size: 14px;
  letter-spacing: -0.02em;
  margin-right: 20px;
  text-decoration: none;
}

.logo::after {
  content: '_';
  color: var(--tv-accent);
  animation: tv-blink 1.1s step-end infinite;
}

@keyframes tv-blink { 50% { opacity: 0; } }

.tabs {
  display: flex;
  gap: 2px;
  flex: 1;
}

.tab {
  background: none;
  border: none;
  color: var(--tv-fg-muted);
  font-family: var(--font-mono);
  font-size: 12px;
  padding: 4px 10px;
  cursor: pointer;
  border-radius: var(--tv-radius);
  transition: color 0.1s, background 0.1s;
}

.tab:hover { color: var(--tv-fg); background: var(--tv-elevated); }
.tab.active { color: var(--tv-mid); background: var(--tv-elevated); }

.cmd-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--tv-elevated);
  border: 1px solid var(--tv-border);
  border-radius: var(--tv-radius);
  color: var(--tv-fg-muted);
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 4px 10px;
  cursor: pointer;
  transition: border-color 0.1s;
}

.cmd-btn:hover { border-color: var(--tv-aborder); color: var(--tv-fg); }

.cmd-btn .key {
  color: var(--tv-accent);
  font-weight: 600;
  font-size: 11px;
}

.cmd-btn .blink {
  display: inline-block;
  width: 6px;
  height: 12px;
  background: var(--tv-accent);
  animation: tv-blink 1.1s step-end infinite;
  vertical-align: middle;
}

/* ── Stats strip ── */
.stats-strip {
  display: flex;
  gap: 0;
  border-bottom: 1px solid var(--tv-border);
}

.stat-card {
  flex: 1;
  padding: 14px 24px;
  border-right: 1px solid var(--tv-border);
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.stat-card:last-child { border-right: none; }

.stat-num {
  font-size: 24px;
  font-weight: 600;
  color: var(--tv-fg);
  letter-spacing: -0.04em;
}

.stat-num.type-project { color: #6EE7B7; }
.stat-num.type-study   { color: #93C5FD; }
.stat-num.stat-muted   { color: var(--tv-fg-muted); font-size: 20px; }

.stat-label {
  font-size: 10px;
  color: var(--tv-fg-dim);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

/* ── Note list ── */
.note-list {
  display: flex;
  flex-direction: column;
}

.note-row {
  display: grid;
  grid-template-columns: 32px 56px 1fr 48px;
  align-items: center;
  gap: 12px;
  padding: 10px 24px;
  border-bottom: 1px solid rgba(124, 58, 237, 0.08);
  color: var(--tv-fg);
  text-decoration: none;
  transition: background 0.1s;
}

.note-row:hover { background: var(--tv-elevated); }

.note-idx {
  color: var(--tv-fg-dim);
  font-size: 11px;
  text-align: right;
}

.note-type {
  font-size: 10px;
  padding: 2px 6px;
  border-radius: 3px;
  text-align: center;
  border: 1px solid transparent;
}

.type-note    { background: rgba(124,58,237,0.15); border-color: rgba(124,58,237,0.3); color: #A78BFA; }
.type-study   { background: rgba(59,130,246,0.12); border-color: rgba(59,130,246,0.25); color: #93C5FD; }
.type-project { background: rgba(16,185,129,0.12); border-color: rgba(16,185,129,0.25); color: #6EE7B7; }
.type-idea    { background: rgba(245,158,11,0.12); border-color: rgba(245,158,11,0.25); color: #FCD34D; }

.note-title-text {
  font-size: 13px;
  color: var(--tv-fg);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note-date {
  font-size: 11px;
  color: var(--tv-fg-dim);
  text-align: right;
}

/* ── List footer / prompt ── */
.list-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 24px;
  border-top: 1px solid var(--tv-border);
}

.prompt { color: var(--tv-accent); font-size: 12px; font-weight: 600; }
.prompt-text { color: var(--tv-fg-muted); font-size: 12px; }
.cursor-block {
  display: inline-block;
  width: 7px;
  height: 13px;
  background: var(--tv-accent);
  animation: tv-blink 1.1s step-end infinite;
  vertical-align: middle;
}

/* ── Note page ── */
.note-main {
  max-width: 720px;
  margin: 0 auto;
  padding: 32px 24px 64px;
}

.breadcrumb {
  font-size: 11px;
  color: var(--tv-fg-dim);
  margin-bottom: 24px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.breadcrumb a { color: var(--tv-fg-dim); }
.breadcrumb a:hover { color: var(--tv-mid); }
.breadcrumb-sep { color: rgba(124, 58, 237, 0.5); }

.note-title {
  font-size: 28px;
  font-weight: 600;
  color: var(--tv-fg);
  letter-spacing: -0.03em;
  line-height: 1.25;
  margin-bottom: 16px;
}

.tags-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}

.tag {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 3px;
  border: 1px solid transparent;
  text-decoration: none;
}

.note-meta {
  font-size: 11px;
  color: var(--tv-fg-dim);
  margin-bottom: 32px;
  display: flex;
  gap: 12px;
}

.meta-label {
  color: var(--tv-fg-muted);
  margin-right: 4px;
}

.meta-sep { color: var(--tv-border); }

/* ── Note content (markdown) ── */
.note-content {
  border-top: 1px solid var(--tv-border);
  padding-top: 24px;
  margin-bottom: 48px;
}

.note-content h2, .note-content h3 {
  color: var(--tv-fg);
  margin: 24px 0 12px;
  font-weight: 600;
}

.note-content p { margin-bottom: 16px; color: var(--tv-fg); }

.note-content code {
  background: rgba(109, 40, 217, 0.15);
  border-radius: 3px;
  padding: 1px 5px;
  font-size: 12px;
  color: var(--tv-light);
}

.note-content pre {
  background: rgba(109, 40, 217, 0.07);
  border-left: 2px solid rgba(124, 58, 237, 0.5);
  border-radius: 0 var(--tv-radius) var(--tv-radius) 0;
  padding: 16px;
  overflow-x: auto;
  margin-bottom: 16px;
}

.note-content pre code {
  background: none;
  padding: 0;
  color: var(--tv-fg);
}

.note-content table {
  width: 100%;
  border-collapse: collapse;
  margin-bottom: 16px;
  font-size: 12px;
}

.note-content th {
  text-align: left;
  color: var(--tv-fg-dim);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 10px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--tv-border);
}

.note-content td {
  padding: 8px 12px;
  border-bottom: 1px solid rgba(124, 58, 237, 0.06);
  color: var(--tv-fg);
}

.note-content a { color: var(--tv-mid); }
.note-content a:hover { color: var(--tv-light); }
.note-content a.wikilink-broken { color: var(--tv-fg-dim); text-decoration: line-through; }

/* ── Backlinks ── */
.backlinks {
  border-top: 1px solid var(--tv-border);
  padding-top: 24px;
}

.backlinks-title {
  font-size: 10px;
  color: var(--tv-fg-dim);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 12px;
  font-weight: 400;
}

.backlink-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  color: var(--tv-fg-muted);
  text-decoration: none;
  font-size: 12px;
  border-bottom: 1px solid rgba(124, 58, 237, 0.05);
  transition: color 0.1s;
}

.backlink-row:hover { color: var(--tv-mid); }
.backlink-row .arrow { color: var(--tv-accent); }

/* ── Command Palette ── */
.cmd-palette {
  background: rgba(9, 5, 20, 0.96);
  border: 1px solid rgba(124, 58, 237, 0.35);
  border-radius: 10px;
  box-shadow: 0 24px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(124,58,237,0.08);
  width: 560px;
  max-width: 90vw;
  padding: 0;
  color: var(--tv-fg);
  font-family: var(--font-mono);
}

.cmd-palette::backdrop { background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(4px); }

.cmd-form { display: flex; flex-direction: column; }

.cmd-input-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--tv-border);
}

.cmd-icon { color: var(--tv-accent); font-size: 16px; }

.cmd-input {
  flex: 1;
  background: none;
  border: none;
  color: var(--tv-fg);
  font-family: var(--font-mono);
  font-size: 14px;
  outline: none;
}

.cmd-input::placeholder { color: var(--tv-fg-dim); }

.cmd-esc {
  background: none;
  border: 1px solid var(--tv-border);
  border-radius: 3px;
  color: var(--tv-fg-dim);
  font-family: var(--font-mono);
  font-size: 10px;
  padding: 2px 6px;
  cursor: pointer;
}

.cmd-results { min-height: 40px; max-height: 320px; overflow-y: auto; }

.cmd-result {
  display: grid;
  grid-template-columns: 52px 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  text-decoration: none;
  color: var(--tv-fg);
  font-size: 13px;
  transition: background 0.1s;
}

.cmd-result:hover, .cmd-result.selected { background: var(--tv-elevated); }

.cmd-result-type {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  text-align: center;
}

.cmd-result-path {
  font-size: 11px;
  color: var(--tv-fg-dim);
}

.cmd-empty { padding: 20px 16px; color: var(--tv-fg-dim); font-size: 12px; text-align: center; }

.cmd-footer {
  display: flex;
  gap: 16px;
  padding: 10px 16px;
  border-top: 1px solid var(--tv-border);
  font-size: 10px;
  color: var(--tv-fg-dim);
}

.cmd-footer kbd {
  background: var(--tv-elevated);
  border: 1px solid var(--tv-border);
  border-radius: 3px;
  padding: 0 4px;
  font-family: var(--font-mono);
  font-size: 10px;
  color: var(--tv-mid);
}
```

- [ ] **Step 2: Verificar que o arquivo é CSS válido**

```bash
node -e "require('fs').readFileSync('packages/site/src/styles/terminal-violet.css', 'utf8'); console.log('OK')"
```

Esperado: `OK`

- [ ] **Step 3: Commit**

```bash
git add packages/site/src/styles/terminal-violet.css
git commit -m "feat(site): Terminal Violet CSS — todos os tokens e componentes"
```

---

## Task 5: Layouts — BaseLayout e NoteLayout

**Files:**
- Create: `packages/site/src/layouts/BaseLayout.astro`
- Create: `packages/site/src/layouts/NoteLayout.astro`

- [ ] **Step 1: Criar BaseLayout.astro**

Criar `packages/site/src/layouts/BaseLayout.astro`:

```astro
---
interface Props {
  title: string;
  description?: string;
}
const { title, description = 'Second brain pessoal — Dev, Projetos e Estudos.' } = Astro.props;
---
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{title} · brain</title>
  {description && <meta name="description" content={description} />}
  <link rel="icon" type="image/svg+xml" href="/brain/favicon.svg" />
  <style is:global>
    @import url('/brain/_astro/terminal-violet.css');
  </style>
</head>
<body>
  <slot />
</body>
</html>
```

Nota: em Astro, o CSS importado em um componente é processado pelo Vite e fica disponível globalmente quando o layout é usado. Usar `import` no frontmatter é mais idiomático:

Substituir pelo seguinte (a versão correta com import):

```astro
---
import '../styles/terminal-violet.css';

interface Props {
  title: string;
  description?: string;
}
const { title, description = 'Second brain pessoal — Dev, Projetos e Estudos.' } = Astro.props;
---
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{title} · brain</title>
  {description && <meta name="description" content={description} />}
</head>
<body>
  <slot />
</body>
</html>
```

- [ ] **Step 2: Criar NoteLayout.astro**

Criar `packages/site/src/layouts/NoteLayout.astro`:

```astro
---
import BaseLayout from './BaseLayout.astro';
import Header from '../components/Header.astro';
import Backlinks from '../components/Backlinks.astro';

interface BacklinkRef {
  slug: string;
  title: string;
}

interface Props {
  title: string;
  type: string;
  tags: string[];
  created: string;
  status?: string;
  slug: string;
  backlinks: BacklinkRef[];
}

const { title, type, tags, created, status, slug, backlinks } = Astro.props;

const parts = slug.split('/');
const domain = parts.length > 1 ? parts[0] : null;
const noteName = parts[parts.length - 1];
---
<BaseLayout title={title}>
  <Header />
  <main class="note-main">
    {domain && (
      <div class="breadcrumb">
        <span>{domain}</span>
        <span class="breadcrumb-sep">/</span>
        <span>{noteName}</span>
      </div>
    )}
    <h1 class="note-title">{title}</h1>
    <div class="tags-row">
      {tags.map(tag => (
        <a href={`/brain/tags/${tag}`} class={`tag type-${type}`}>{tag}</a>
      ))}
    </div>
    <div class="note-meta">
      <span><span class="meta-label">created</span>{created}</span>
      {status && <span><span class="meta-label">status</span>{status}</span>}
    </div>
    <div class="note-content">
      <slot />
    </div>
    <Backlinks items={backlinks} />
  </main>
</BaseLayout>
```

- [ ] **Step 3: Verificar que o build não crasha (ainda sem páginas)**

```bash
cd packages/site && npx astro check
```

Esperado: sem erros de tipagem nos layouts.

- [ ] **Step 4: Commit**

```bash
git add packages/site/src/layouts/
git commit -m "feat(site): BaseLayout + NoteLayout"
```

---

## Task 6: Componentes apresentacionais

**Files:**
- Create: `packages/site/src/components/Header.astro`
- Create: `packages/site/src/components/StatsStrip.astro`
- Create: `packages/site/src/components/NoteCard.astro`
- Create: `packages/site/src/components/NoteList.astro`
- Create: `packages/site/src/components/Backlinks.astro`

- [ ] **Step 1: Criar Header.astro**

Criar `packages/site/src/components/Header.astro`:

```astro
---
const tabs = ['all', 'dev', 'study', 'project', 'idea'];
---
<header class="topbar">
  <a href="/brain/" class="logo">vault</a>
  <nav class="tabs">
    {tabs.map(tab => (
      <button class="tab" data-tab={tab}>
        {tab}
      </button>
    ))}
  </nav>
  <button class="cmd-btn" id="cmd-open" aria-label="Abrir busca (⌘K)">
    <span class="key">⌘K</span>
    <span class="cmd-text">buscar</span>
    <span class="blink"></span>
  </button>
</header>
```

- [ ] **Step 2: Criar StatsStrip.astro**

Criar `packages/site/src/components/StatsStrip.astro`:

```astro
---
interface Props {
  total: number;
  projects: number;
  studies: number;
  links: number;
}
const { total, projects, studies, links } = Astro.props;
---
<div class="stats-strip">
  <div class="stat-card">
    <span class="stat-num">{total}</span>
    <span class="stat-label">notas</span>
  </div>
  <div class="stat-card">
    <span class="stat-num type-project">{projects}</span>
    <span class="stat-label">projetos</span>
  </div>
  <div class="stat-card">
    <span class="stat-num type-study">{studies}</span>
    <span class="stat-label">estudos</span>
  </div>
  <div class="stat-card">
    <span class="stat-num stat-muted">{links}</span>
    <span class="stat-label">links internos</span>
  </div>
</div>
```

- [ ] **Step 3: Criar NoteCard.astro**

Criar `packages/site/src/components/NoteCard.astro`:

```astro
---
interface Props {
  idx: number;
  type: string;
  title: string;
  slug: string;
  created: string;
}
const { idx, type, title, slug, created } = Astro.props;
const dateShort = created.slice(5); // "MM-DD"
---
<a
  href={`/brain/${slug}`}
  class="note-row"
  data-note-type={type}
>
  <span class="note-idx">{String(idx).padStart(2, '0')}</span>
  <span class={`note-type type-${type}`}>{type}</span>
  <span class="note-title-text">{title}</span>
  <span class="note-date">{dateShort}</span>
</a>
```

- [ ] **Step 4: Criar NoteList.astro**

Criar `packages/site/src/components/NoteList.astro`:

```astro
---
import NoteCard from './NoteCard.astro';

interface NoteEntry {
  id: string;
  data: { title: string; type: string; created: string };
}

interface Props {
  notes: NoteEntry[];
}
const { notes } = Astro.props;
const sorted = [...notes].sort((a, b) =>
  b.data.created.localeCompare(a.data.created)
);
---
<div class="note-list" id="note-list">
  {sorted.map((note, i) => (
    <NoteCard
      idx={i + 1}
      type={note.data.type}
      title={note.data.title}
      slug={note.id}
      created={note.data.created}
    />
  ))}
</div>
<div class="list-footer">
  <span class="prompt">vault $</span>
  <span class="prompt-text">create --type note</span>
  <span class="cursor-block"></span>
</div>
```

- [ ] **Step 5: Criar Backlinks.astro**

Criar `packages/site/src/components/Backlinks.astro`:

```astro
---
interface BacklinkRef {
  slug: string;
  title: string;
}
interface Props {
  items: BacklinkRef[];
}
const { items } = Astro.props;
---
{items.length > 0 && (
  <section class="backlinks">
    <h3 class="backlinks-title">Backlinks ({items.length})</h3>
    {items.map(link => (
      <a href={`/brain/${link.slug}`} class="backlink-row">
        <span class="arrow">←</span>
        <span>{link.title}</span>
      </a>
    ))}
  </section>
)}
```

- [ ] **Step 6: Verificar tipos com astro check**

```bash
cd packages/site && npx astro check
```

Esperado: sem erros de tipagem nos componentes.

- [ ] **Step 7: Commit**

```bash
git add packages/site/src/components/
git commit -m "feat(site): componentes apresentacionais — Header, Stats, NoteList, Backlinks"
```

---

## Task 7: CommandPalette com script interativo

**Files:**
- Create: `packages/site/src/components/CommandPalette.astro`

- [ ] **Step 1: Criar CommandPalette.astro com dialog e script inline**

Criar `packages/site/src/components/CommandPalette.astro`:

```astro
---
---
<dialog id="cmd-palette" class="cmd-palette" aria-label="Busca e comandos">
  <form method="dialog" class="cmd-form">
    <div class="cmd-input-row">
      <span class="cmd-icon" aria-hidden="true">⌕</span>
      <input
        type="text"
        id="cmd-input"
        class="cmd-input"
        placeholder="buscar notas..."
        autocomplete="off"
        spellcheck="false"
        aria-label="Buscar"
      />
      <button type="submit" class="cmd-esc">esc</button>
    </div>
    <div id="cmd-results" class="cmd-results" role="listbox" aria-label="Resultados"></div>
    <div class="cmd-footer">
      <span><kbd>↑↓</kbd> navegar</span>
      <span><kbd>↵</kbd> abrir</span>
      <span><kbd>esc</kbd> fechar</span>
    </div>
  </form>
</dialog>

<script>
  const dialog = document.getElementById('cmd-palette') as HTMLDialogElement;
  const input = document.getElementById('cmd-input') as HTMLInputElement;
  const results = document.getElementById('cmd-results') as HTMLDivElement;
  const openBtn = document.getElementById('cmd-open');

  let selectedIdx = -1;
  let pagefind: any = null;
  let debounceTimer: ReturnType<typeof setTimeout>;

  async function loadPagefind() {
    if (!pagefind) {
      // @ts-ignore — pagefind is generated at build time
      pagefind = await import('/brain/pagefind/pagefind.js');
      await pagefind.init();
    }
    return pagefind;
  }

  function getResultEls() {
    return Array.from(results.querySelectorAll<HTMLAnchorElement>('.cmd-result'));
  }

  function updateSelection(newIdx: number) {
    const items = getResultEls();
    items.forEach(el => el.classList.remove('selected'));
    selectedIdx = Math.max(-1, Math.min(items.length - 1, newIdx));
    if (selectedIdx >= 0) items[selectedIdx]?.classList.add('selected');
  }

  function renderResults(items: any[]) {
    selectedIdx = -1;
    results.innerHTML = '';
    if (!items.length) {
      results.innerHTML = '<div class="cmd-empty">Nenhum resultado</div>';
      return;
    }
    items.slice(0, 8).forEach((item, i) => {
      const el = document.createElement('a');
      el.href = item.url;
      el.className = 'cmd-result';
      el.setAttribute('role', 'option');
      const type = item.meta?.type ?? 'note';
      const title = item.meta?.title ?? item.url.split('/').pop();
      const pathPart = item.url.split('/').slice(-2, -1)[0] ?? '';
      el.innerHTML = `
        <span class="cmd-result-type type-${type}">${type}</span>
        <span class="cmd-result-title">${title}</span>
        <span class="cmd-result-path">${pathPart}/</span>
      `;
      results.appendChild(el);
    });
  }

  async function doSearch(query: string) {
    if (!query.trim()) { results.innerHTML = ''; return; }
    const pf = await loadPagefind();
    const searchResult = await pf.search(query);
    const items = await Promise.all(
      searchResult.results.slice(0, 8).map((r: any) => r.data())
    );
    renderResults(items);
  }

  function openPalette() {
    dialog.showModal();
    input.value = '';
    results.innerHTML = '';
    input.focus();
  }

  openBtn?.addEventListener('click', openPalette);

  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      openPalette();
      return;
    }
    if (!dialog.open) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); updateSelection(selectedIdx + 1); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); updateSelection(selectedIdx - 1); }
    if (e.key === 'Enter' && selectedIdx >= 0) {
      const selected = getResultEls()[selectedIdx];
      if (selected) window.location.href = selected.href;
    }
  });

  input?.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => doSearch(input.value), 150);
  });

  dialog?.addEventListener('click', (e: MouseEvent) => {
    if (e.target === dialog) dialog.close();
  });
</script>
```

- [ ] **Step 2: Verificar tipagem**

```bash
cd packages/site && npx astro check
```

Esperado: sem erros de tipagem no componente.

- [ ] **Step 3: Commit**

```bash
git add packages/site/src/components/CommandPalette.astro
git commit -m "feat(site): CommandPalette — dialog ⌘K com Pagefind e navegação por teclado"
```

---

## Task 8: Página inicial — index.astro

**Files:**
- Create: `packages/site/src/pages/index.astro`

- [ ] **Step 1: Criar index.astro**

Criar `packages/site/src/pages/index.astro`:

```astro
---
import BaseLayout from '../layouts/BaseLayout.astro';
import Header from '../components/Header.astro';
import StatsStrip from '../components/StatsStrip.astro';
import NoteList from '../components/NoteList.astro';
import CommandPalette from '../components/CommandPalette.astro';
import { getCollection } from 'astro:content';
import { getStats } from '../lib/stats';

const allNotes = await getCollection('vault', ({ id }) => id !== 'index');
const noteMetas = allNotes.map(note => ({
  id: note.id,
  title: note.data.title,
  type: note.data.type,
  tags: note.data.tags,
  body: note.body ?? '',
}));
const stats = getStats(noteMetas);
---
<BaseLayout title="vault_">
  <Header />
  <StatsStrip
    total={stats.total}
    projects={stats.byType['project'] ?? 0}
    studies={stats.byType['study'] ?? 0}
    links={stats.internalLinks}
  />
  <NoteList notes={allNotes} />
  <CommandPalette />
</BaseLayout>

<script>
  // Tab filter — runs after DOM is ready
  document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(tab => {
    tab.addEventListener('click', () => {
      const type = tab.dataset.tab!;
      document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(t =>
        t.classList.toggle('active', t.dataset.tab === type)
      );
      document.querySelectorAll<HTMLElement>('[data-note-type]').forEach(row => {
        row.hidden = type !== 'all' && row.dataset.noteType !== type;
      });
    });
  });
  // Set 'all' as default active
  document.querySelector<HTMLButtonElement>('[data-tab="all"]')?.classList.add('active');
</script>
```

- [ ] **Step 2: Testar o build pela primeira vez com conteúdo**

```bash
cd packages/site && npx astro build
```

Esperado: build bem-sucedido. Saída como:
```
✓ Completed in Xs.
```

Se houver erros de tipagem no schema (ex: `index.md` com campos adicionais), o build falhará com mensagem clara de qual campo é inválido. Corrigir o `content/index.md` se necessário.

- [ ] **Step 3: Verificar visualmente com o dev server**

```bash
cd packages/site && npx astro dev
```

Abrir `http://localhost:4321/brain/` no browser. Verificar:
- Topbar com `vault_` (cursor piscante) + tabs + botão ⌘K
- Stats strip com 4 cards (mostra 0s se o vault está vazio — ok)
- Note list (vazia se não há notas além de index.md — ok)
- Prompt `vault $ create --type note _` no rodapé

- [ ] **Step 4: Commit**

```bash
git add packages/site/src/pages/index.astro
git commit -m "feat(site): homepage — stats strip + note list + tab filter"
```

---

## Task 9: Página de nota — [...slug].astro

**Files:**
- Create: `packages/site/src/pages/[...slug].astro`

- [ ] **Step 1: Criar [...slug].astro**

Criar `packages/site/src/pages/[...slug].astro`:

```astro
---
import NoteLayout from '../layouts/NoteLayout.astro';
import CommandPalette from '../components/CommandPalette.astro';
import { getCollection, render } from 'astro:content';
import { buildBacklinksMap } from '../lib/backlinks';

export async function getStaticPaths() {
  const notes = await getCollection('vault', ({ id }) => id !== 'index');
  const noteMetas = notes.map(n => ({
    id: n.id,
    title: n.data.title,
    type: n.data.type,
    tags: n.data.tags,
    body: n.body ?? '',
  }));
  const backlinksMap = buildBacklinksMap(noteMetas);

  return notes.map(note => ({
    params: { slug: note.id },
    props: {
      note,
      backlinks: backlinksMap[note.id] ?? [],
    },
  }));
}

const { note, backlinks } = Astro.props;
const { Content } = await render(note);
---
<NoteLayout
  title={note.data.title}
  type={note.data.type}
  tags={note.data.tags}
  created={note.data.created}
  status={note.data.status}
  slug={note.id}
  backlinks={backlinks}
>
  <Content />
</NoteLayout>
<CommandPalette />
```

- [ ] **Step 2: Adicionar uma nota de teste ao vault para verificar**

Criar `content/10_Dev/git-workflows.md`:

```markdown
---
title: Git Workflows avançados
type: note
tags: [dev, git]
created: "2026-06-13"
status: ready
---

Guia de workflows Git para times.

## Rebase interativo

```bash
git rebase -i HEAD~3
git push --force-with-lease
```

Referência: [[vault_]]
```

- [ ] **Step 3: Fazer o build e verificar que a nota foi gerada**

```bash
cd packages/site && npx astro build
```

Esperado: sem erros. Verificar que `dist/brain/10_Dev/git-workflows/index.html` existe:

```bash
ls packages/site/dist/brain/10_Dev/
```

Esperado: `git-workflows/` presente.

- [ ] **Step 4: Verificar a página de nota no dev server**

```bash
cd packages/site && npx astro dev
```

Abrir `http://localhost:4321/brain/10_Dev/git-workflows` e verificar:
- Breadcrumb: `10_Dev / git-workflows`
- Título: `Git Workflows avançados`
- Badge de tag `dev` com cor violet, `git` com cor violet
- Meta: `created 2026-06-13 · status ready`
- Conteúdo markdown renderizado
- Seção de backlinks (vazia neste caso — ok)

- [ ] **Step 5: Commit**

```bash
git add packages/site/src/pages/\[...slug\].astro content/10_Dev/git-workflows.md
git commit -m "feat(site): página de nota individual com backlinks"
```

---

## Task 10: Página de tag — tags/[tag].astro

**Files:**
- Create: `packages/site/src/pages/tags/[tag].astro`

- [ ] **Step 1: Criar tags/[tag].astro**

Criar `packages/site/src/pages/tags/[tag].astro`:

```astro
---
import BaseLayout from '../../layouts/BaseLayout.astro';
import Header from '../../components/Header.astro';
import NoteList from '../../components/NoteList.astro';
import CommandPalette from '../../components/CommandPalette.astro';
import { getCollection } from 'astro:content';

export async function getStaticPaths() {
  const notes = await getCollection('vault', ({ id }) => id !== 'index');
  const tagSet = new Set<string>();
  notes.forEach(n => n.data.tags.forEach(t => tagSet.add(t)));

  return [...tagSet].map(tag => ({
    params: { tag },
    props: {
      tag,
      notes: notes.filter(n => n.data.tags.includes(tag)),
    },
  }));
}

const { tag, notes } = Astro.props;
---
<BaseLayout title={`#${tag}`}>
  <Header />
  <div class="stats-strip">
    <div class="stat-card">
      <span class="stat-num">{notes.length}</span>
      <span class="stat-label">#{tag}</span>
    </div>
  </div>
  <NoteList notes={notes} />
  <CommandPalette />
</BaseLayout>

<script>
  document.querySelector<HTMLButtonElement>('[data-tab="all"]')?.classList.add('active');
</script>
```

- [ ] **Step 2: Build completo e verificar rota de tag**

```bash
cd packages/site && npx astro build
ls packages/site/dist/brain/tags/
```

Esperado: pasta `dev/` e `git/` dentro de `tags/` (baseado na nota de teste criada na Task 9).

- [ ] **Step 3: Verificar no dev server**

```bash
cd packages/site && npx astro dev
```

Abrir `http://localhost:4321/brain/tags/dev`. Verificar:
- Topbar com tabs
- Stats card: `1 nota · #dev`
- Nota `Git Workflows avançados` na lista

- [ ] **Step 4: Commit**

```bash
git add packages/site/src/pages/tags/
git commit -m "feat(site): página de tag com lista filtrada"
```

---

## Task 11: CI/CD + cleanup do .gitignore

**Files:**
- Modify: `.github/workflows/deploy.yml`
- Modify: `.gitignore`

- [ ] **Step 1: Atualizar .gitignore**

Substituir as entradas Quartz pelo seguinte em `.gitignore`:

Remover as linhas:
```
# Quartz — só commitar configs e custom.scss
packages/site/*
!packages/site/quartz.config.yaml
!packages/site/quartz.config.default.yaml
!packages/site/quartz.lock.json
!packages/site/quartz/
packages/site/quartz/*
!packages/site/quartz/styles/
packages/site/quartz/styles/*
!packages/site/quartz/styles/custom.scss
```

Adicionar:
```
# Astro
packages/site/node_modules/
packages/site/dist/
packages/site/.astro/
packages/site-build/
```

- [ ] **Step 2: Atualizar deploy.yml**

Substituir `packages/site-build` inteiro. O novo `.github/workflows/deploy.yml` completo:

```yaml
name: Deploy Vault to GitHub Pages

on:
  push:
    branches: [main]
    paths:
      - "content/**"
      - "packages/site/**"
      - "schemas/**"
      - ".github/workflows/**"

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: "pages"
  cancel-in-progress: false

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"
          cache-dependency-path: package-lock.json

      - name: Install CLI deps
        run: cd packages/cli && npm ci

      - name: Build CLI
        run: cd packages/cli && npm run build

      - name: Validate vault
        run: node packages/cli/dist/index.js validate --strict

  build:
    needs: validate
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "22.12"

      - name: Install site deps
        run: cd packages/site && npm ci

      - name: Build site + Pagefind index
        run: cd packages/site && npm run build
        env:
          VAULT_PATH: ${{ github.workspace }}/content

      - name: Upload Pages artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: packages/site/dist

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 3: Build final completo para validar tudo junto**

```bash
cd packages/site && npm run build
```

Esperado:
```
✓ Completed in Xs.
```

Verificar que `packages/site/dist/pagefind/` existe:
```bash
ls packages/site/dist/pagefind/
```

Esperado: `pagefind.js`, `pagefind-highlight.js`, e arquivos de índice.

- [ ] **Step 4: Screenshot final com Playwright**

```bash
cd packages/site && npx astro dev &
sleep 8
playwright screenshot --browser chromium http://localhost:4321/brain/ /tmp/astro-final.png --viewport-size="1440,900"
```

Verificar que a screenshot mostra o design Terminal Violet com topbar, stats strip e note list.

- [ ] **Step 5: Commit final**

```bash
git add .github/workflows/deploy.yml .gitignore
git commit -m "feat(site): migração Quartz → Astro 6 completa — CI/CD atualizado"
```

---

## Self-review

**Spec coverage:**
- ✅ Astro 6 com Content Layer API (Task 1)
- ✅ stats.ts com testes (Task 2)
- ✅ backlinks.ts com testes (Task 2)
- ✅ wikilinks buildSlugMap com testes (Task 3)
- ✅ remark-wiki-link integrado no astro.config (Task 3)
- ✅ terminal-violet.css com todos os tokens (Task 4)
- ✅ BaseLayout + NoteLayout (Task 5)
- ✅ Header, StatsStrip, NoteCard, NoteList, Backlinks (Task 6)
- ✅ CommandPalette ⌘K com Pagefind + teclado (Task 7)
- ✅ Homepage com stats + note list + tab filter (Task 8)
- ✅ Nota individual com backlinks (Task 9)
- ✅ Tag page (Task 10)
- ✅ CI/CD simplificado (Task 11)
- ✅ .gitignore atualizado (Task 11)

**Placeholder scan:** Nenhum TBD, TODO ou step sem código encontrado.

**Type consistency:**
- `NoteMeta` definida em `stats.ts` e re-usada em `backlinks.ts` via import — consistente
- `BacklinkRef` definida em `backlinks.ts` e re-usada em `NoteLayout` e `Backlinks` com interface inline equivalente — consistente
- `note.id` usado como slug em todas as páginas — consistente
