/** Vérifie le build complet avant diffusion : liens locaux, images et indexation. */
import { readdir, readFile, access } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../dist');
const preview = process.argv.includes('--preview');
const failures = [];
const pages = [];
async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(file);
    else if (entry.name.endsWith('.html')) pages.push(file);
  }
}
await walk(root);
const htmlByPage = new Map(await Promise.all(pages.map(async p => [p, await readFile(p, 'utf8')])));
const exists = async file => { try { await access(file); return true; } catch { return false; } };
let links = 0;
for (const [file, html] of htmlByPage) {
  const relative = path.relative(root, file);
  const pathname = relative === 'index.html' ? '/' : '/' + relative.replace(/index\.html$/, '');
  const pageUrl = new URL(pathname, 'https://lawandorder.shop');
  const noindex = /<meta\s+name="robots"[^>]*content="[^"]*noindex/.test(html);
  if (file !== path.join(root, '404.html') && noindex !== preview) failures.push(`${relative} : indexation incorrecte pour ce build`);
  if (file !== path.join(root, '404.html') && !html.includes('rel="canonical"')) failures.push(`${relative} : canonique absente`);
  const ids = Array.from(html.matchAll(/\bid="([^"]+)"/g), m => m[1]);
  if (new Set(ids).size !== ids.length) failures.push(`${relative} : identifiant HTML répété`);
  for (const match of html.matchAll(/\b(?:href|src|poster)="([^"]+)"/g)) {
    const value = match[1].replace(/&amp;/g, '&');
    if (/^(?:mailto:|tel:|data:)/.test(value)) continue;
    const url = new URL(value, pageUrl);
    if (url.origin !== pageUrl.origin) continue;
    links++;
    const target = path.join(root, decodeURIComponent(url.pathname), url.pathname.endsWith('/') ? 'index.html' : '');
    if (!await exists(target)) { failures.push(`${relative} : cible absente ${value}`); continue; }
    if (url.hash && target.endsWith('.html')) {
      const content = htmlByPage.get(target) ?? await readFile(target, 'utf8');
      const id = decodeURIComponent(url.hash.slice(1));
      if (!Array.from(content.matchAll(/\bid="([^"]+)"/g), m => m[1]).includes(id)) failures.push(`${relative} : ancre absente ${value}`);
    }
  }
  for (const match of html.matchAll(/<img\b([^>]+)>/g)) {
    if (!/\balt="/.test(match[1])) failures.push(`${relative} : texte alternatif absent`);
    for (const srcset of match[1].matchAll(/\bsrcset="([^"]+)"/g)) {
      for (const candidate of srcset[1].split(',')) {
        const url = new URL(candidate.trim().split(/\s+/)[0], pageUrl);
        if (url.origin === pageUrl.origin && !await exists(path.join(root, url.pathname))) failures.push(`${relative} : variante d'image absente ${url.pathname}`);
      }
    }
  }
  if (/Chris North|priso, Mayor of Kingstownn/.test(html)) failures.push(`${relative} : coquille éditoriale connue`);
  if (relative.includes('saison-11/') && /cast__actor[^>]*>Producteurs/.test(html)) failures.push(`${relative} : producteurs dans la distribution`);
}
const robots = await readFile(path.join(root, 'robots.txt'), 'utf8');
if (robots.includes('Disallow: /') !== preview) failures.push('robots.txt ne correspond pas au mode de publication');
const sitemapIndex = await readFile(path.join(root, 'sitemap-index.xml'), 'utf8');
if (!sitemapIndex.includes('https://lawandorder.shop/')) failures.push('Sitemap : domaine incorrect');
const sitemap = await readFile(path.join(root, 'sitemap-0.xml'), 'utf8');
if (sitemap.includes('/404')) failures.push('La page 404 ne doit pas figurer dans le sitemap');
if (!await exists(path.join(root, 'favicon.svg')) || !await exists(path.join(root, '404.html'))) failures.push('Favicon ou page 404 absente');
const legacy = JSON.parse(await readFile(path.resolve(import.meta.dirname, '../src/data/legacy-routes.json'), 'utf8'));
for (const pathname of legacy.paths) {
  if (!await exists(path.join(root, pathname, 'index.html'))) failures.push(`Ancienne adresse non conservée : ${pathname}`);
}
if (failures.length) {
  console.error([...new Set(failures)].join('\n'));
  process.exitCode = 1;
} else console.log(`${pages.length} pages · ${links} liens et médias locaux · ${legacy.paths.length} anciennes adresses · mode ${preview ? 'préversion non indexable' : 'public indexable'} : OK`);
