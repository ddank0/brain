import { describe, it, expect } from 'vitest'
import { validateFrontmatter } from '../src/lib/schemas'

describe('validateFrontmatter', () => {
  it('retorna [] para um note válido', () => {
    const errors = validateFrontmatter(
      { title: 'Test', type: 'note', tags: ['dev'], created: '2026-05-31' },
      'note'
    )
    expect(errors).toEqual([])
  })

  it('retorna erro se title estiver faltando', () => {
    const errors = validateFrontmatter(
      { type: 'note', tags: ['dev'], created: '2026-05-31' },
      'note'
    )
    expect(errors.some(e => e.includes('title'))).toBe(true)
  })

  it('retorna erro se data não está no formato YYYY-MM-DD', () => {
    const errors = validateFrontmatter(
      { title: 'Test', type: 'note', tags: ['dev'], created: '31/05/2026' },
      'note'
    )
    expect(errors.some(e => e.includes('created'))).toBe(true)
  })

  it('retorna erro para project sem status', () => {
    const errors = validateFrontmatter(
      { title: 'P', type: 'project', tags: ['project'], created: '2026-05-31' },
      'project'
    )
    expect(errors.some(e => e.includes('status'))).toBe(true)
  })

  it('retorna erro para study sem medium', () => {
    const errors = validateFrontmatter(
      { title: 'S', type: 'study', tags: ['study'], created: '2026-05-31' },
      'study'
    )
    expect(errors.some(e => e.includes('medium'))).toBe(true)
  })
})
