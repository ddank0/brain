import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, writeFileSync, rmSync } from 'fs'
import { join } from 'path'
import { runStats } from '../src/commands/stats'

const TMP = join(__dirname, '__stats_tmp__')

function note(dir: string, filename: string, fm: object, body = '') {
  const lines = ['---', ...Object.entries(fm).map(([k, v]) => `${k}: ${JSON.stringify(v)}`), '---', '', body]
  mkdirSync(join(TMP, 'content', dir), { recursive: true })
  writeFileSync(join(TMP, 'content', dir, filename), lines.join('\n'))
}

beforeEach(() => mkdirSync(join(TMP, 'content'), { recursive: true }))
afterEach(() => rmSync(TMP, { recursive: true, force: true }))

describe('runStats', () => {
  it('conta notas corretamente por tipo', async () => {
    note('10_Dev', 'a.md', { title: 'A', type: 'note', tags: ['dev'], created: '2026-05-31' })
    note('10_Dev', 'b.md', { title: 'B', type: 'note', tags: ['ts'], created: '2026-05-31' })
    note('20_Projects', 'p.md', { title: 'P', type: 'project', tags: ['project'], created: '2026-05-31', status: 'active' })

    const stats = await runStats({ vaultRoot: TMP })

    expect(stats.totals.note).toBe(2)
    expect(stats.totals.project).toBe(1)
    expect(stats.total).toBe(3)
  })

  it('identifica notas órfãs (sem links [[...]] no body)', async () => {
    note('10_Dev', 'orphan.md', { title: 'O', type: 'note', tags: ['dev'], created: '2026-05-31' }, 'No links here')
    note('10_Dev', 'linked.md', { title: 'L', type: 'note', tags: ['dev'], created: '2026-05-31' }, 'See [[orphan]]')

    const stats = await runStats({ vaultRoot: TMP })

    expect(stats.orphans).toHaveLength(1)
    expect(stats.orphans[0]).toContain('orphan.md')
  })

  it('retorna top tags por frequência', async () => {
    note('10_Dev', 'a.md', { title: 'A', type: 'note', tags: ['dev', 'docker'], created: '2026-05-31' })
    note('10_Dev', 'b.md', { title: 'B', type: 'note', tags: ['dev', 'ts'], created: '2026-05-31' })

    const stats = await runStats({ vaultRoot: TMP })

    expect(stats.topTags[0]).toEqual({ tag: 'dev', count: 2 })
  })
})
