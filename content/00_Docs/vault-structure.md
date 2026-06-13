---
title: Estrutura do Vault
type: docs
tags: [docs, vault, organização]
created: "2026-06-13"
status: ready
---

Como o vault está organizado e quais tipos de nota usar.

## Diretórios

| Pasta | Tipo | Uso |
|-------|------|-----|
| `10_Dev/` | note | Tecnologia, ferramentas, arquitetura, cheat sheets |
| `20_Projects/` | project | Projetos ativos e planejados |
| `30_Studies/` | study | Cursos, livros, aprendizados estruturados |
| `50_Ideas/` | idea | Braindump, rascunhos, conceitos em aberto |
| `90_Archive/` | note | Notas obsoletas ou concluídas |
| `00_Docs/` | doc | Documentação deste projeto |

## Frontmatter Obrigatório

```yaml
---
title: Título da Nota
type: note          # note | study | project | idea | docs
tags: [tag1, tag2]
created: "YYYY-MM-DD"
status: ready       # draft | ready (opcional)
---
```

## Convenções

- **Filenames**: `kebab-case`, sem acentos
- **Títulos**: podem ter acentos e maiúsculas
- **Tags**: lowercase, sem espaços
- **Datas**: sempre no formato `"YYYY-MM-DD"` com aspas

## Wikilinks

Use `[[título da nota]]` para linkar entre notas. O título pode ser o nome do arquivo ou o `title` do frontmatter — ambos são resolvidos.

```markdown
Ver também: [[Docker — Cheat Sheet]] e [[Git Workflows avançados]]
```
