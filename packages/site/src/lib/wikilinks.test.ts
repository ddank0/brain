import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildSlugMap } from './wikilinks';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const tmpDir = '/tmp/test-vault-wikilinks';

beforeAll(() => {
  mkdirSync(join(tmpDir, '10_Dev'), { recursive: true });
  mkdirSync(join(tmpDir, '30_Studies'), { recursive: true });
  writeFileSync(
    join(tmpDir, '10_Dev/docker-cheat-sheet.md'),
    '---\ntitle: Docker — Cheat Sheet\ntype: note\ntags: [dev]\ncreated: 2026-01-01\n---\nconteúdo'
  );
  writeFileSync(
    join(tmpDir, '10_Dev/git-workflows.md'),
    '---\ntitle: Git Workflows\ntype: note\ntags: [dev]\ncreated: 2026-01-01\n---\nconteúdo'
  );
  writeFileSync(
    join(tmpDir, 'index.md'),
    '---\ntitle: vault_\ntype: note\ntags: [home]\ncreated: 2026-01-01\n---\nhome'
  );
  writeFileSync(
    join(tmpDir, '30_Studies/clean-code.md'),
    "---\ntitle: Clean Code\ntype: study\ntags: [book]\ncreated: 2026-01-01\n---\nconteúdo"
  );
});

afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('buildSlugMap', () => {
  it('mapeia filename para slug', () => {
    const map = buildSlugMap(tmpDir);
    expect(map['docker-cheat-sheet']).toBe('10_dev/docker-cheat-sheet');
  });

  it('mapeia title lowercase para slug', () => {
    const map = buildSlugMap(tmpDir);
    expect(map['git workflows']).toBe('10_dev/git-workflows');
  });

  it('mapeia title com caracteres especiais', () => {
    const map = buildSlugMap(tmpDir);
    expect(map['docker — cheat sheet']).toBe('10_dev/docker-cheat-sheet');
  });

  it('inclui arquivos de subpastas', () => {
    const map = buildSlugMap(tmpDir);
    expect(map['clean code']).toBe('30_studies/clean-code');
  });

  it('normaliza o slug para lowercase — rotas do Astro são case-sensitive', () => {
    const map = buildSlugMap(tmpDir);
    for (const slug of Object.values(map)) {
      expect(slug).toBe(slug.toLowerCase());
    }
  });

  it('mapeia index.md para a raiz, não para /index', () => {
    const map = buildSlugMap(tmpDir);
    expect(map['vault_']).toBe('');
    expect(map['index']).toBe('');
  });
});
