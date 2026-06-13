import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import remarkWikiLink from 'remark-wiki-link';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import { buildSlugMap } from './src/lib/wikilinks.ts';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const vaultPath = process.env.VAULT_PATH ?? resolve(__dirname, '../../content');
const slugMap = buildSlugMap(vaultPath);

export default defineConfig({
  base: '/brain',
  output: 'static',
  markdown: {
    processor: unified({
      remarkPlugins: [
        [remarkWikiLink, {
          pageResolver: (name) => {
            const key = name.toLowerCase();
            return [slugMap[key] ?? name.toLowerCase().replace(/\s+/g, '-')];
          },
          hrefTemplate: (permalink) => `/brain/${permalink}`,
          wikiLinkClassName: 'wikilink',
          newClassName: 'wikilink-broken',
          permalinks: Object.values(slugMap),
        }],
      ],
      rehypePlugins: [
        rehypeSlug,
        [rehypeAutolinkHeadings, { behavior: 'append' }],
      ],
    }),
    syntaxHighlight: 'shiki',
    shikiConfig: { theme: 'github-dark' },
  },
});
