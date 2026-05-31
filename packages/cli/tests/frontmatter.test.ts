import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdirSync, rmSync } from 'fs'
import { join } from 'path'
import { parseFrontmatter, writeFrontmatter } from '../src/lib/frontmatter'

const TMP = join(__dirname, '__tmp__')

beforeEach(() => mkdirSync(TMP, { recursive: true }))
afterEach(() => rmSync(TMP, { recursive: true, force: true }))

describe('parseFrontmatter', () => {
  it('retorna data e content de um arquivo markdown válido', () => {
    const file = join(TMP, 'test.md')
    writeFileSync(file, `---\ntitle: "Test"\ntype: note\ntags: [dev]\ncreated: 2026-05-31\n---\n\n## Body\n`)

    const { data, content } = parseFrontmatter(file)

    expect(data.title).toBe('Test')
    expect(data.type).toBe('note')
    expect(data.tags).toEqual(['dev'])
    expect(content.trim()).toBe('## Body')
  })

  it('retorna objeto vazio se o arquivo não tem frontmatter', () => {
    const file = join(TMP, 'no-fm.md')
    writeFileSync(file, '# Just a title\n')

    const { data } = parseFrontmatter(file)
    expect(data).toEqual({})
  })
})

describe('writeFrontmatter', () => {
  it('escreve frontmatter de volta no arquivo corretamente', () => {
    const file = join(TMP, 'write.md')
    const data = { title: 'Written', type: 'note' as const, tags: ['dev'], created: '2026-05-31' }

    writeFrontmatter(file, data, '## Content here\n')

    const { data: parsed, content } = parseFrontmatter(file)
    expect(parsed.title).toBe('Written')
    expect(content.trim()).toBe('## Content here')
  })
})
