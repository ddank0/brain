import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { runValidate } from '../src/commands/validate'

const TMP = join(__dirname, '__validate_tmp__')

function writeNote(filename: string, fm: object, body = '## Body\n') {
  const lines = ['---', ...Object.entries(fm).map(([k, v]) => `${k}: ${JSON.stringify(v)}`), '---', '', body]
  writeFileSync(join(TMP, 'content/10_Dev', filename), lines.join('\n'))
}

beforeEach(() => {
  mkdirSync(join(TMP, 'content/10_Dev'), { recursive: true })
})
afterEach(() => rmSync(TMP, { recursive: true, force: true }))

describe('runValidate', () => {
  it('retorna true e sem erros quando todas as notas são válidas', async () => {
    writeNote('valid.md', { title: 'Valid', type: 'note', tags: ['dev'], created: '2026-05-31' })

    const result = await runValidate({ vaultRoot: TMP })
    expect(result.success).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('retorna false e lista erros quando frontmatter está inválido', async () => {
    writeNote('invalid.md', { type: 'note', tags: ['dev'], created: '2026-05-31' }) // sem title

    const result = await runValidate({ vaultRoot: TMP })
    expect(result.success).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
    expect(result.errors[0].file).toContain('invalid.md')
  })

  it('pula arquivos sem campo type sem lançar erro', async () => {
    writeNote('no-type.md', { title: 'No type' })

    const result = await runValidate({ vaultRoot: TMP })
    expect(result.success).toBe(true)
    expect(result.skipped).toContain(join(TMP, 'content/10_Dev/no-type.md'))
  })
})
