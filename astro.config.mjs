// @ts-check
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://lawandorder.shop',
  // Les URL du site actuel sont indexées sous /toutes-les-saisons/saison-N/ :
  // on les conserve, avec la barre finale, pour ne casser aucun lien entrant.
  trailingSlash: 'always',
  build: { format: 'directory' },
  image: { responsiveStyles: true },
  integrations: [sitemap({ filter: (page) => !page.endsWith('/404/') && !page.endsWith('/404') })],
});
