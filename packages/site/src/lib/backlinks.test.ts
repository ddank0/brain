import { describe, it, expect } from 'vitest';
import { buildBacklinksMap } from './backlinks';

const notes = [
  { id: '10_Dev/docker', title: 'Docker Cheat Sheet', type: 'note', tags: [], body: '[[Git Workflows]]' },
  { id: '10_Dev/git', title: 'Git Workflows', type: 'note', tags: [], body: '[[Docker Cheat Sheet]]' },
  { id: '30_Studies/clean-code', title: 'Clean Code', type: 'study', tags: [], body: '[[Docker Cheat Sheet]] [[Git Workflows]]' },
  { id: '50_Ideas/standalone', title: 'Standalone', type: 'idea', tags: [], body: '' },
];

describe('buildBacklinksMap', () => {
  it('detecta backlinks por title match', () => {
    const map = buildBacklinksMap(notes);
    expect(map['10_Dev/docker']).toHaveLength(2);
    expect(map['10_Dev/docker'].map(b => b.slug)).toContain('10_Dev/git');
    expect(map['10_Dev/docker'].map(b => b.slug)).toContain('30_Studies/clean-code');
  });

  it('detecta backlinks para git-workflows', () => {
    const map = buildBacklinksMap(notes);
    expect(map['10_Dev/git']).toHaveLength(2);
  });

  it('retorna undefined para nota sem backlinks', () => {
    const map = buildBacklinksMap(notes);
    expect(map['50_Ideas/standalone']).toBeUndefined();
  });

  it('inclui title no backlink ref', () => {
    const map = buildBacklinksMap(notes);
    const dockerBacklinks = map['10_Dev/docker'];
    const gitRef = dockerBacklinks.find(b => b.slug === '10_Dev/git');
    expect(gitRef?.title).toBe('Git Workflows');
  });
});
