import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const vaultPath = process.env.VAULT_PATH ?? resolve(__dirname, '../../../content');

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

// Espelha schemas/*.json - as duas definições devem mudar juntas.
const base = {
  title: z.string().min(1),
  tags: z.array(z.string()).min(1),
  created: date,
};

const note = z.object({
  ...base,
  type: z.literal('note'),
  updated: date.optional(),
  source: z.string().optional(),
  status: z.enum(['draft', 'ready']).optional(),
});

const docs = z.object({
  ...base,
  type: z.literal('docs'),
  updated: date.optional(),
  status: z.enum(['draft', 'ready']).optional(),
});

const project = z.object({
  ...base,
  type: z.literal('project'),
  status: z.enum(['active', 'done', 'paused']),
  goal: z.string().optional(),
  stack: z.array(z.string()).optional(),
});

const study = z.object({
  ...base,
  type: z.literal('study'),
  medium: z.enum(['book', 'course', 'video']),
  author: z.string().optional(),
  rating: z.number().int().min(1).max(5).optional(),
});

const idea = z.object({
  ...base,
  type: z.literal('idea'),
  stage: z.enum(['seedling', 'evergreen']).optional(),
  related: z.array(z.string()).optional(),
});

const vault = defineCollection({
  loader: glob({
    pattern: '**/*.md',
    base: vaultPath,
  }),
  schema: z.discriminatedUnion('type', [note, docs, project, study, idea]),
});

export const collections = { vault };
