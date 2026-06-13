import type { NoteMeta } from './stats';

export interface BacklinkRef {
  slug: string;
  title: string;
}

export function buildBacklinksMap(notes: NoteMeta[]): Record<string, BacklinkRef[]> {
  const slugByKey: Record<string, string> = {};

  for (const note of notes) {
    slugByKey[note.title.toLowerCase()] = note.id;
    const filename = note.id.split('/').pop() ?? '';
    const filenameKey = filename.toLowerCase();
    if (!slugByKey[filenameKey]) {
      slugByKey[filenameKey] = note.id;
    }
  }

  const backlinks: Record<string, BacklinkRef[]> = {};
  const wikilinkRegex = /\[\[([^\]|#]+)(?:[|#][^\]]+)?\]\]/g;

  for (const note of notes) {
    for (const match of note.body.matchAll(wikilinkRegex)) {
      const ref = match[1].trim().toLowerCase();
      const targetSlug = slugByKey[ref];
      if (!targetSlug || targetSlug === note.id) continue;
      if (!backlinks[targetSlug]) backlinks[targetSlug] = [];
      const alreadyAdded = backlinks[targetSlug].some(b => b.slug === note.id);
      if (!alreadyAdded) {
        backlinks[targetSlug].push({ slug: note.id, title: note.title });
      }
    }
  }

  return backlinks;
}
