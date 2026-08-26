import type { APIRoute } from 'astro';

import { IS_PREVIEW } from '../lib/env';

/**
 * La préversion sert une copie complète du site : elle doit rester hors des
 * moteurs, sans quoi elle concurrence lawandorder.shop sur ses propres pages.
 */
export const GET: APIRoute = ({ site }) =>
  new Response(
    IS_PREVIEW
      ? 'User-agent: *\nDisallow: /\n'
      : `User-agent: *\nAllow: /\n\nSitemap: ${new URL('sitemap-index.xml', site)}\n`,
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
