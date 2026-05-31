import { walkVault } from '../lib/vault'
import { parseFrontmatter } from '../lib/frontmatter'

type NoteType = 'note' | 'project' | 'study' | 'idea'

export interface VaultStats {
  total: number
  totals: Partial<Record<NoteType, number>>
  orphans: string[]
  topTags: Array<{ tag: string; count: number }>
}

export async function runStats(options: { vaultRoot?: string; topN?: number }): Promise<VaultStats> {
  const root = options.vaultRoot ?? process.cwd()
  const topN = options.topN ?? 10
  const files = walkVault(root)

  const totals: Partial<Record<NoteType, number>> = {}
  const orphans: string[] = []
  const tagCounts: Record<string, number> = {}

  for (const file of files) {
    const { data, content } = parseFrontmatter(file)

    const type = data.type as NoteType | undefined
    if (type) totals[type] = (totals[type] ?? 0) + 1

    const hasLinks = /\[\[.+?\]\]/.test(content)
    if (!hasLinks) orphans.push(file)

    if (Array.isArray(data.tags)) {
      for (const tag of data.tags) {
        tagCounts[String(tag)] = (tagCounts[String(tag)] ?? 0) + 1
      }
    }
  }

  const topTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([tag, count]) => ({ tag, count }))

  return { total: files.length, totals, orphans, topTags }
}
