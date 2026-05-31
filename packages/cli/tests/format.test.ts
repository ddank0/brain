import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs'
import { join } from 'path'
import { runFormat } from '../src/commands/format'
import { parseFrontmatter } from '../src/lib/frontmatter'

const TMP = join(__dirname, '__format_tmp__')

function writeNote(filename: string, content: string) {
  writeFileSync(join(TMP, filename), content)
  return join(TMP, filename)
}

beforeEach(() => mkdirSync(TMP, { recursive: true }))
afterEach(() => rmSync(TMP, { recursive: true, force: true }))

describe('runFormat', () => {
  it('converte tags para lowercase', async () => {
    const file = writeNote('a.md', `---\ntitle: "T"\ntype: note\ntags: [Dev, DOCKER]\ncreated: 2026-05-31\n---\n`)

    await runFormat({ files: [file], write: true })

    const { data } = parseFrontmatter(file)
    expect(data.tags).toEqual(['dev', 'docker'])
  })

  it('normaliza data para YYYY-MM-DD quando está em outro formato', async () => {
    const file = writeNote('b.md', `---\ntitle: "T"\ntype: note\ntags: [dev]\ncreated: "2026-5-1"\n---\n`)

    await runFormat({ files: [file], write: true })

    const { data } = parseFrontmatter(file)
    expect(data.created).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('não modifica o arquivo se --write não for passado (dry run)', async () => {
    const file = writeNote('c.md', `---\ntitle: "T"\ntype: note\ntags: [DEV]\ncreated: 2026-05-31\n---\n`)
    const before = readFileSync(file, 'utf-8')

    await runFormat({ files: [file], write: false })

    expect(readFileSync(file, 'utf-8')).toBe(before)
  })
})
