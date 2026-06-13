import { describe, it, expect } from 'vitest';
import { getStats } from './stats';

const notes = [
  { id: '10_Dev/docker', title: 'Docker', type: 'note', tags: ['dev', 'docker'], body: '[[Git Workflows]] [[Clean Code]]' },
  { id: '10_Dev/git', title: 'Git Workflows', type: 'note', tags: ['dev', 'git'], body: '' },
  { id: '30_Studies/clean-code', title: 'Clean Code', type: 'study', tags: ['book', 'dev'], body: '[[Docker]]' },
  { id: '20_Projects/vault', title: 'Vault Framework', type: 'project', tags: ['dev'], body: '[[Docker]] [[Git Workflows]]' },
];

describe('getStats', () => {
  it('conta total de notas', () => {
    expect(getStats(notes).total).toBe(4);
  });

  it('agrupa por type', () => {
    const stats = getStats(notes);
    expect(stats.byType['note']).toBe(2);
    expect(stats.byType['study']).toBe(1);
    expect(stats.byType['project']).toBe(1);
  });

  it('conta links internos (wikilinks)', () => {
    expect(getStats(notes).internalLinks).toBe(5);
  });

  it('ordena topTags por frequência', () => {
    const stats = getStats(notes);
    expect(stats.topTags[0].tag).toBe('dev');
    expect(stats.topTags[0].count).toBe(4);
  });

  it('inclui todas as tags no resultado', () => {
    const stats = getStats(notes);
    const tagNames = stats.topTags.map(t => t.tag);
    expect(tagNames).toContain('docker');
    expect(tagNames).toContain('book');
  });
});
