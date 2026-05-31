import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { walkVault } from '../src/lib/vault'

const TMP = join(__dirname, '__vault_tmp__')

beforeEach(() => {
  mkdirSync(join(TMP, 'content/10_Dev'), { recursive: true })
  mkdirSync(join(TMP, 'content/20_Projects'), { recursive: true })
  writeFileSync(join(TMP, 'content/10_Dev/note.md'), '# test')
  writeFileSync(join(TMP, 'content/20_Projects/proj.md'), '# proj')
  writeFileSync(join(TMP, 'content/10_Dev/image.png'), 'binary')
})
afterEach(() => rmSync(TMP, { recursive: true, force: true }))

describe('walkVault', () => {
  it('retorna somente arquivos .md', () => {
    const files = walkVault(TMP)
    expect(files.every(f => f.endsWith('.md'))).toBe(true)
    expect(files).toHaveLength(2)
  })

  it('aceita pattern customizado para filtrar por pasta', () => {
    const files = walkVault(TMP, 'content/10_Dev/**/*.md')
    expect(files).toHaveLength(1)
    expect(files[0]).toContain('10_Dev')
  })
})
