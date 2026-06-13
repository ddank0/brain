import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';

export default defineConfig({
  base: '/brain',
  output: 'static',
  markdown: {
    processor: unified({
      rehypePlugins: [
        rehypeSlug,
        [rehypeAutolinkHeadings, { behavior: 'append' }],
      ],
    }),
    syntaxHighlight: 'shiki',
    shikiConfig: { theme: 'github-dark' },
  },
});
