# brain_

Personal knowledge vault - Obsidian notes published as a static site with a terminal-style UI.

**Live:** [ddank0.github.io/brain](https://ddank0.github.io/brain)

---

## What this is

A second brain built on Obsidian, versioned in git, and published via GitHub Pages. Notes are written in Markdown with structured frontmatter, organized into domains, and cross-linked with `[[wikilinks]]`.

The site renders everything with [Astro](https://astro.build) - full-text search via [Pagefind](https://pagefind.app), backlink graph, tag archive, command palette (`⌘K`).

## Structure

```
content/           Obsidian vault (the actual notes)
├── 00_Docs/       Project documentation
├── 10_Dev/        Dev notes & references
├── 20_Projects/   Active and past projects
├── 30_Studies/    Books, courses, papers
├── 50_Ideas/      Seedling thoughts
└── 90_Archive/    Completed or stale notes

packages/
├── cli/           vault CLI - validate, create, format, stats
└── site/          Astro 6 static site

schemas/           JSON Schema for each note type (pre-commit validation)
```

## Note types

| Type | Required fields |
|------|----------------|
| `note` | title, tags, created |
| `project` | title, tags, created, status |
| `study` | title, tags, created, medium |
| `idea` | title, tags, created |
| `docs` | title, tags, created |

## CLI

```bash
npm run vault validate          # validate all notes against schemas
npm run vault create note       # scaffold a new note
npm run vault format            # normalize dates and tags
npm run vault stats             # counts by type, top tags, orphans
```

## Site - local dev

```bash
cd packages/site
npm install
npm run dev       # http://localhost:4321/brain
npm run build     # static output + pagefind index
npm run test      # unit tests (vitest)
npm run test:e2e  # Playwright E2E
```

## Deploy

Pushes to `main` trigger the GitHub Actions pipeline:

1. **validate** - runs `vault validate --strict` on all markdown
2. **build** - `astro build` + `pagefind --site dist`
3. **deploy** - uploads to GitHub Pages

## Design

Terminal Violet - dark monospace UI with a violet accent palette, JetBrains Mono, and a command palette for keyboard-first navigation.
