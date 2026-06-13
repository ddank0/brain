export interface NoteMeta {
  id: string;
  title: string;
  type: string;
  tags: string[];
  body: string;
}

export interface VaultStats {
  total: number;
  byType: Record<string, number>;
  topTags: Array<{ tag: string; count: number }>;
  internalLinks: number;
}

export function getStats(notes: NoteMeta[]): VaultStats {
  const total = notes.length;

  const byType: Record<string, number> = {};
  for (const note of notes) {
    byType[note.type] = (byType[note.type] ?? 0) + 1;
  }

  const tagCounts: Record<string, number> = {};
  for (const note of notes) {
    for (const tag of note.tags) {
      tagCounts[tag] = (tagCounts[tag] ?? 0) + 1;
    }
  }
  const topTags = Object.entries(tagCounts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);

  const wikilinkRegex = /\[\[[^\]]+\]\]/g;
  let internalLinks = 0;
  for (const note of notes) {
    internalLinks += (note.body.match(wikilinkRegex) ?? []).length;
  }

  return { total, byType, topTags, internalLinks };
}
