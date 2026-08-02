import { test, expect } from '@playwright/test';

/**
 * Regressão: buildSlugMap preservava o case do caminho no vault
 * (20_Projects/...), mas o glob loader do Astro normaliza note.id para
 * lowercase e as rotas saem de note.id. Todo wikilink para nota em subpasta
 * gerava href 404 - o GitHub Pages é case-sensitive.
 */

async function listarPaginasDeNotas(page): Promise<string[]> {
  await page.goto('/brain/');
  const hrefs = await page.$$eval('a.note-row[href]', (as: Element[]) =>
    as.map(a => a.getAttribute('href')!).filter(Boolean)
  );
  const paginas = [...new Set(hrefs)].filter(h => h.startsWith('/brain/'));
  expect(paginas.length, 'a home deve listar notas').toBeGreaterThan(0);
  return paginas;
}

test.describe('Links internos', () => {
  test('todo wikilink aponta para uma rota que existe', async ({ page, request }) => {
    const paginas = await listarPaginasDeNotas(page);
    const quebrados: string[] = [];

    for (const pagina of paginas) {
      await page.goto(pagina);
      const hrefs = await page.$$eval('a.wikilink[href]', (as: Element[]) =>
        as.map(a => a.getAttribute('href')!)
      );

      for (const href of [...new Set(hrefs)]) {
        const alvo = href.split('#')[0].split('?')[0];
        const res = await request.get(alvo);
        if (!res.ok()) quebrados.push(`${pagina} → ${alvo} (HTTP ${res.status()})`);
      }
    }

    expect(quebrados, `wikilinks quebrados:\n${quebrados.join('\n')}`).toEqual([]);
  });

  test('nenhum href de wikilink contém maiúsculas', async ({ page }) => {
    const paginas = await listarPaginasDeNotas(page);
    const comMaiuscula: string[] = [];

    for (const pagina of paginas) {
      await page.goto(pagina);
      const hrefs = await page.$$eval('a.wikilink[href]', (as: Element[]) =>
        as.map(a => a.getAttribute('href')!)
      );
      for (const href of hrefs) {
        if (/[A-Z]/.test(href)) comMaiuscula.push(`${pagina} → ${href}`);
      }
    }

    expect(comMaiuscula, `hrefs com maiúscula:\n${comMaiuscula.join('\n')}`).toEqual([]);
  });

  test('wikilinks não ficam marcados como quebrados', async ({ page }) => {
    const paginas = await listarPaginasDeNotas(page);
    const marcados: string[] = [];

    for (const pagina of paginas) {
      await page.goto(pagina);
      const textos = await page.$$eval('.wikilink-broken', (els: Element[]) =>
        els.map(e => e.textContent?.trim() ?? '')
      );
      for (const t of textos) marcados.push(`${pagina} → "${t}"`);
    }

    expect(marcados, `wikilinks sem destino:\n${marcados.join('\n')}`).toEqual([]);
  });
});
