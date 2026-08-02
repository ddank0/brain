import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, basename } from 'node:path';

function walk(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...walk(full));
    } else if (entry.endsWith('.md')) {
      results.push(full);
    }
  }
  return results;
}

export function buildSlugMap(contentDir: string): Record<string, string> {
  const slugMap: Record<string, string> = {};

  for (const file of walk(contentDir)) {
    const relPath = relative(contentDir, file);
    // O glob loader do Astro normaliza o id para lowercase, e as rotas saem de
    // note.id. Como as pastas do vault têm maiúsculas (10_Dev, 20_Projects...),
    // manter o case original geraria href 404 no GitHub Pages, que é
    // case-sensitive.
    const raw = relPath.replace(/\.md$/, '').toLowerCase();
    // index.md é a home: [...slug].astro filtra id !== 'index', então /brain/index
    // não existe como rota. O href correto é a raiz, /brain/.
    const slug = raw === 'index' ? '' : raw;
    const filenameKey = basename(file, '.md').toLowerCase();
    const content = readFileSync(file, 'utf-8');
    const titleMatch = content.match(/^title:\s*["']?(.+?)["']?\s*$/m);
    const title = titleMatch?.[1]?.trim().toLowerCase();

    if (!slugMap[filenameKey]) slugMap[filenameKey] = slug;
    if (title && !slugMap[title]) slugMap[title] = slug;
  }

  return slugMap;
}
