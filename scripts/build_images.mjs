#!/usr/bin/env node
/**
 * Prépare les visuels du site à partir des dossiers sources Elephant Films.
 *
 * Les originaux sont des PNG de 5 à 10 Mo destinés à l'impression : on en tire
 * ici des masters web (packshots avec transparence, photos d'épisodes), qu'Astro
 * décline ensuite en tailles et formats au build.
 */
import { mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const SOURCE = '/Users/harly/Desktop/LAW & ORDER VOL. 3';
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'src/assets/generated');

const PACKSHOT_WIDTH = 1200; // affiché au maximum sur ~600 px, x2 pour les écrans HiDPI
const PHOTO_WIDTH = 1400;
const PHOTOS_PER_SEASON = 6;
const PHOTOS_PER_EPISODE = 2;

// Les photos de production nomment parfois l'épisode qu'elles illustrent :
// « Ep18_WHITELIE_E1312_…Still003.png ». C'est le seul lien fiable entre une
// image et un épisode — les codes de production (E1304) ne suivent pas l'ordre
// de diffusion, on ne les interprète pas.
const EPISODE_IN_NAME = /(?:^|[@_-])Ep(\d{1,2})_/i;

// Les coffrets intégrales ne sont pas rangés par saison : leurs visuels sont
// désignés un par un. On retient le boîtier seul, et non la composition avec
// les saisons dépliées — celle de l'intégrale 1 à 5 porte un macaron
// « Exclusivité Fnac » qui n'a pas sa place ici.
const INTEGRALES = {
  '1-5': {
    bluray: {
      ean: '3348469316407',
      packshot: 'INTEGRALE/PACKSHOTS/Coffr_BD-Law_S1a5-3D.png',
      dos: 'INTEGRALE/2D/Coffr-Law&Ord_1a5-BD-Dos.jpg',
    },
    dvd: {
      ean: '3348467316348',
      packshot: 'INTEGRALE/PACKSHOTS/Law_S1a5-DVD-3D.png',
      dos: 'INTEGRALE/2D/Coffr-Law&Ord_1a5-DVD-Dos.jpg',
    },
  },
  '6-10': {
    bluray: {
      ean: '3700146553718',
      packshot: 'COFFRET BLU-RAY/PACKSHOTS 3D/CoffrBD_Law_S6a10-3D.png',
      dos: 'COFFRET BLU-RAY/VISUELS 2D/Coffr_Law_S6a10-BD-Dos.jpg',
    },
    dvd: {
      ean: '3700146553725',
      packshot: 'COFFRET DVD/PACKSHOTS 3D/CoffrDVD_Law_S6a10-3D.png',
      dos: 'COFFRET DVD/VISUELS 2D/Coffr_Law_S6a10-DVD-Dos.jpg',
    },
  },
};

const COVER_WIDTH = 1400; // le dos porte du texte : il doit rester lisible agrandi

async function packshot(src, dest) {
  // Les sources retenues sont les PNG détourés : la transparence est conservée
  // pour que les coffrets se posent sur le fond sombre du site sans cadre.
  const { hasAlpha } = await sharp(src).metadata();
  if (!hasAlpha) {
    throw new Error(`Packshot sans transparence : ${src}`);
  }
  // Les rendus sont composés au centre d'une grande zone transparente : le
  // coffret n'occupe qu'environ 60 % de la largeur. On rogne cette marge pour
  // qu'il remplisse son cadre — les pages le posent dans des blocs aux
  // dimensions fixes, la proportion propre à chaque visuel n'y change rien.
  const info = await sharp(src)
    .trim({ threshold: 1 })
    .resize({ width: PACKSHOT_WIDTH, withoutEnlargement: true })
    .webp({ quality: 88, alphaQuality: 100 })
    .toFile(dest);
  return info.size;
}

async function cover(src, dest) {
  // Dos de jaquette : à plat, opaque, chargé de texte. Pas de transparence à
  // préserver, mais une qualité supérieure aux photos pour rester lisible.
  const info = await sharp(src)
    .resize({ width: COVER_WIDTH, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toFile(dest);
  return info.size;
}

async function photo(src, dest) {
  const info = await sharp(src)
    .resize({ width: PHOTO_WIDTH, withoutEnlargement: true })
    .webp({ quality: 72 })
    .toFile(dest);
  return info.size;
}

const kb = (bytes) => `${Math.round(bytes / 1024)} Ko`;

async function main() {
  const seasons = JSON.parse(
    await readFile(path.join(ROOT, 'src/data/seasons.json'), 'utf8'),
  );

  await rm(OUT, { recursive: true, force: true });
  await mkdir(path.join(OUT, 'packshots'), { recursive: true });
  await mkdir(path.join(OUT, 'photos'), { recursive: true });
  await mkdir(path.join(OUT, 'episodes'), { recursive: true });
  await mkdir(path.join(OUT, 'integrales'), { recursive: true });
  await mkdir(path.join(OUT, 'dos'), { recursive: true });

  const manifest = { seasons: {}, integrales: {} };
  let totalIn = 0;
  let totalOut = 0;

  for (const season of seasons) {
    const entry = { packshots: {}, dos: {}, photos: [], episodes: {} };

    for (const [support, data] of Object.entries(season.supports)) {
      if (data.packshot) {
        const src = path.join(SOURCE, data.packshot);
        const name = `s${season.number}-${support}.webp`;
        const size = await packshot(src, path.join(OUT, 'packshots', name));
        totalIn += (await stat(src)).size;
        totalOut += size;
        entry.packshots[support] = `packshots/${name}`;
      }
      if (data.dos) {
        const src = path.join(SOURCE, data.dos);
        const name = `s${season.number}-${support}-dos.webp`;
        const size = await cover(src, path.join(OUT, 'dos', name));
        totalIn += (await stat(src)).size;
        totalOut += size;
        entry.dos[support] = `dos/${name}`;
      }
    }

    const available = season.photos.filter((p) => /\.(jpe?g|png|tiff?)$/i.test(p));

    // Photos rattachées à un épisode : elles illustrent le guide.
    const byEpisode = new Map();
    for (const rel of available) {
      const match = path.basename(rel).match(EPISODE_IN_NAME);
      if (!match) continue;
      const episode = Number(match[1]);
      const list = byEpisode.get(episode) ?? [];
      if (list.length < PHOTOS_PER_EPISODE) {
        list.push(rel);
        byEpisode.set(episode, list);
      }
    }

    for (const [episode, files] of [...byEpisode].sort((a, b) => a[0] - b[0])) {
      entry.episodes[episode] = [];
      for (const [i, rel] of files.entries()) {
        const name = `s${season.number}-e${episode}-${i + 1}.webp`;
        const size = await photo(path.join(SOURCE, rel), path.join(OUT, 'episodes', name));
        totalIn += (await stat(path.join(SOURCE, rel))).size;
        totalOut += size;
        entry.episodes[episode].push(`episodes/${name}`);
      }
    }

    // Galerie de la saison : un échantillon régulier de ce qui reste, plutôt
    // que les premiers du tri. On évite les photos déjà servies dans le guide,
    // sauf si la saison n'en a pas d'autres.
    const used = new Set([...byEpisode.values()].flat());
    const pool = available.filter((rel) => !used.has(rel));
    const source = pool.length >= PHOTOS_PER_SEASON ? pool : available;
    const step = Math.max(1, Math.floor(source.length / PHOTOS_PER_SEASON));
    const picked = source.filter((_, i) => i % step === 0).slice(0, PHOTOS_PER_SEASON);

    for (const [i, rel] of picked.entries()) {
      const src = path.join(SOURCE, rel);
      const name = `s${season.number}-${i + 1}.webp`;
      const size = await photo(src, path.join(OUT, 'photos', name));
      totalIn += (await stat(src)).size;
      totalOut += size;
      entry.photos.push(`photos/${name}`);
    }

    manifest.seasons[season.number] = entry;
    const illustrated = Object.keys(entry.episodes).length;
    process.stdout.write(
      `S${String(season.number).padEnd(2)} ${Object.keys(entry.packshots).length} packshot(s), ` +
        `${Object.keys(entry.dos).length} dos, ` +
        `${entry.photos.length} photo(s) de galerie, ` +
        `${illustrated} épisode(s) illustré(s)\n`,
    );
  }

  for (const [range, supports] of Object.entries(INTEGRALES)) {
    manifest.integrales[range] = {};
    for (const [support, sources] of Object.entries(supports)) {
      const { ean, ...visuels } = sources;
      const entry = { ean };
      for (const [kind, rel] of Object.entries(visuels)) {
        const src = path.join(SOURCE, rel);
        const name = `${range}-${support}${kind === 'dos' ? '-dos' : ''}.webp`;
        const dir = kind === 'dos' ? 'dos' : 'integrales';
        const size = await (kind === 'dos' ? cover : packshot)(src, path.join(OUT, dir, name));
        totalIn += (await stat(src)).size;
        totalOut += size;
        entry[kind] = `${dir}/${name}`;
      }
      manifest.integrales[range][support] = entry;
    }
    console.log(`Intégrale ${range.replace('-', ' à ')} — packshots et dos, DVD et Blu-ray`);
  }

  await writeFile(
    path.join(ROOT, 'src/data/images.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );

  console.log(`\nSources ${kb(totalIn)} → web ${kb(totalOut)}`);
}

await main();
