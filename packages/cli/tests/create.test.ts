import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, existsSync, rmSync } from 'fs'
import { join } from 'path'
import { runCreate } from '../src/commands/create'
import { parseFrontmatter } from '../src/lib/frontmatter'

const TMP = join(__dirname, '__create_tmp__')
const FOLDERS: Record<string, string> = {
  note:    join(TMP, 'content/10_Dev'),
  project: join(TMP, 'content/20_Projects'),
  study:   join(TMP, 'content/30_Studies'),
  idea:    join(TMP, 'content/50_Ideas'),
}

beforeEach(() => Object.values(FOLDERS).forEach(f => mkdirSync(f, { recursive: true })))
afterEach(() => rmSync(TMP, { recursive: true, force: true }))

describe('runCreate', () => {
  it('cria um arquivo .md no diretório correto para type=note', async () => {
    const filePath = await runCreate({ title: 'My Note', type: 'note', vaultRoot: TMP })

    expect(existsSync(filePath)).toBe(true)
    expect(filePath).toContain('10_Dev')
    expect(filePath).toContain('my-note.md')
  })

  it('frontmatter do arquivo criado tem title e created preenchidos', async () => {
    const filePath = await runCreate({ title: 'My Project', type: 'project', vaultRoot: TMP })
    const { data } = parseFrontmatter(filePath)

    expect(data.title).toBe('My Project')
    expect(data.type).toBe('project')
    expect(data.created).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('gera slug kebab-case a partir do title', async () => {
    const filePath = await runCreate({ title: 'Docker Cheat Sheet', type: 'note', vaultRoot: TMP })
    expect(filePath).toContain('docker-cheat-sheet.md')
  })

  it('aceita --dir para sobrescrever a pasta padrão', async () => {
    const customDir = join(TMP, 'content/90_Archive')
    mkdirSync(customDir, { recursive: true })
    const filePath = await runCreate({ title: 'Old Note', type: 'note', vaultRoot: TMP, dir: customDir })
    expect(filePath).toContain('90_Archive')
  })
})
