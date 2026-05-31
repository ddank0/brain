import matter from 'gray-matter'
import { readFileSync, writeFileSync } from 'fs'

export interface NoteFrontmatter {
  title: string
  type: 'note' | 'project' | 'study' | 'idea'
  tags: string[]
  created: string
  [key: string]: unknown
}

export function parseFrontmatter(filePath: string): { data: NoteFrontmatter; content: string } {
  const raw = readFileSync(filePath, 'utf-8')
  const { data, content } = matter(raw)
  return { data: data as NoteFrontmatter, content }
}

export function writeFrontmatter(filePath: string, data: NoteFrontmatter, content: string): void {
  const output = matter.stringify(content, data as Record<string, unknown>)
  writeFileSync(filePath, output, 'utf-8')
}
