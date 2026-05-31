import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'

type NoteType = 'note' | 'project' | 'study' | 'idea'

const TYPE_FOLDERS: Record<NoteType, string> = {
  note:    'content/10_Dev',
  project: 'content/20_Projects',
  study:   'content/30_Studies',
  idea:    'content/50_Ideas',
}

function toSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

function today(): string {
  return new Date().toISOString().split('T')[0]
}

function getTemplatePath(type: NoteType): string {
  return join(__dirname, '..', 'templates', `${type}.md`)
}

export async function runCreate(options: {
  title: string
  type: NoteType
  vaultRoot?: string
  dir?: string
}): Promise<string> {
  const root = options.vaultRoot ?? process.cwd()
  const folder = options.dir ?? join(root, TYPE_FOLDERS[options.type])
  const slug = toSlug(options.title)
  const filePath = join(folder, `${slug}.md`)

  const templatePath = getTemplatePath(options.type)
  const template = readFileSync(templatePath, 'utf-8')
  const content = template
    .replace('{{title}}', options.title)
    .replace('{{date}}', today())

  writeFileSync(filePath, content, 'utf-8')
  return filePath
}
