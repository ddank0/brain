import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const vaultPath = process.env.VAULT_PATH ?? resolve(__dirname, '../../../content');

const vault = defineCollection({
  loader: glob({
    pattern: '**/*.md',
    base: vaultPath,
  }),
  schema: z.object({
    title: z.string(),
    type: z.enum(['note', 'study', 'project', 'idea']),
    tags: z.array(z.string()),
    created: z.string(),
    updated: z.string().optional(),
    status: z.enum(['draft', 'ready']).optional(),
  }),
});

export const collections = { vault };
