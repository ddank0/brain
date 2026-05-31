import { parseFrontmatter, writeFrontmatter, NoteFrontmatter } from '../lib/frontmatter'

function normalizeDate(raw: unknown): string {
  if (typeof raw !== 'string') return String(raw)
  const parts = raw.split('-')
  if (parts.length !== 3) return raw
  const [y, m, d] = parts
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function normalizeFrontmatter(data: NoteFrontmatter): NoteFrontmatter {
  return {
    ...data,
    tags: Array.isArray(data.tags) ? data.tags.map(t => String(t).toLowerCase()) : data.tags,
    created: data.created ? normalizeDate(data.created) : data.created,
    ...(data.updated ? { updated: normalizeDate(data.updated as string) } : {}),
  }
}

export interface FormatResult {
  file: string
  changed: boolean
}

export async function runFormat(options: {
  files: string[]
  write: boolean
  silent?: boolean
}): Promise<FormatResult[]> {
  const results: FormatResult[] = []

  for (const file of options.files) {
    const { data, content } = parseFrontmatter(file)
    const normalized = normalizeFrontmatter(data)
    const changed = JSON.stringify(data) !== JSON.stringify(normalized)

    if (changed && options.write) {
      writeFrontmatter(file, normalized, content)
    }

    results.push({ file, changed })
  }

  return results
}
