#!/usr/bin/env node
/**
 * Prépare les visuels du site à partir des dossiers sources Elephant Films.
 *
 * Les originaux sont des PNG de 5 à 10 Mo destinés à l'impression : on en tire
 * ici des masters web (packshots avec transparence, photos d'épisodes), qu'Astro
 * décline ensuite en tailles et formats au build.
 */
import { cp, mkdir, mkdtemp, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { identifyImage, uniqueImages } from './episode_images.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE = path.dirname(ROOT);
const DESTINATION = path.join(ROOT, 'src/assets/generated');
let OUT;

const PACKSHOT_WIDTH = 1200; // affiché au maximum sur ~600 px, x2 pour les écrans HiDPI
const PHOTO_WIDTH = 1400;
const PHOTOS_PER_SEASON = 6;
const PHOTOS_PER_EPISODE = 2;

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
  '11-15': {
    bluray: {
      ean: '3700146554715',
      packshot: 'COFFRET SAISONS 11 A 15/PACKSHOTS 3D/BLU-RAY/CoffrBD_Law_S11a15-3D.png',
      dos: 'COFFRET SAISONS 11 A 15/VISUELS 2D/BLU-RAY/Coffr_Law_11a15-BD-Dos.jpg',
    },
    dvd: {
      ean: '3700146554722',
      packshot: 'COFFRET SAISONS 11 A 15/PACKSHOTS 3D/DVD/CoffrDVD_Law_S11a15-3D.png',
      dos: 'COFFRET SAISONS 11 A 15/VISUELS 2D/DVD/Coffr_Law_11a15-DVD-Dos.jpg',
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
  const allSeasons = JSON.parse(
    await readFile(path.join(ROOT, 'src/data/seasons.json'), 'utf8'),
  );
  const selection = process.argv.find((arg) => arg.startsWith('--seasons='))?.split('=')[1];
  const requested = selection ? new Set(selection.split(',').map(Number)) : undefined;
  if (requested && (!requested.size || [...requested].some((n) => !allSeasons.some((s) => s.number === n)))) {
    throw new Error('Sélection de saisons invalide');
  }
  const seasons = requested ? allSeasons.filter((s) => requested.has(s.number)) : allSeasons;
  const rangeSelection = process.argv.find((arg) => arg.startsWith('--integrales='))?.split('=')[1];
  const ranges = rangeSelection ? new Set(rangeSelection.split(',')) : undefined;
  if (ranges && [...ranges].some((range) => !INTEGRALES[range])) {
    throw new Error('Sélection d’intégrales invalide');
  }
  const selectedIntegrales = Object.entries(INTEGRALES).filter(([range]) => ranges ? ranges.has(range) : !requested);
  const manifest = requested
    ? JSON.parse(await readFile(path.join(ROOT, 'src/data/images.json'), 'utf8'))
    : { seasons: {}, integrales: {} };
  const report = requested
    ? JSON.parse(await readFile(path.join(ROOT, 'src/data/image-import-report.json'), 'utf8'))
    : { seasons: {} };
  if (requested) {
    // Les sources originales d'autres saisons peuvent avoir été archivées.
    // Leurs masters déjà préparés restent nécessaires au site complet.
    const retained = Object.entries(manifest.seasons).filter(([number]) => !requested.has(Number(number)));
    for (const [, entry] of retained) {
      for (const relative of [...Object.values(entry.packshots), ...Object.values(entry.dos), ...entry.photos, ...Object.values(entry.episodes).flat()]) {
        await stat(path.join(DESTINATION, relative));
      }
    }
  }
  const mapping = JSON.parse(await readFile(path.join(ROOT, 'src/data/episode-image-mapping.json'), 'utf8'));
  const guide = {
    ...JSON.parse(await readFile(path.join(ROOT, 'src/data/early-episodes.json'), 'utf8')),
    ...JSON.parse(await readFile(path.join(ROOT, 'src/data/booklet.json'), 'utf8')),
    ...JSON.parse(await readFile(path.join(ROOT, 'src/data/episodes.json'), 'utf8')),
  };
  // Vérifier les sources et les correspondances avant de remplacer les masters.
  const required = seasons.flatMap((season) => [
    ...season.photos,
    ...Object.values(season.supports).flatMap((edition) => [edition.packshot, edition.dos].filter(Boolean)),
  ]);
  for (const [, supports] of selectedIntegrales) {
    for (const { packshot, dos } of Object.values(supports)) required.push(packshot, dos);
  }
  for (const relative of required) await stat(path.join(SOURCE, relative));
  const validSources = new Map();
  const invalidSources = new Map();
  for (const season of seasons) {
    const valid = [];
    const invalid = [];
    for (const relative of season.photos) {
      try {
        await sharp(path.join(SOURCE, relative)).metadata();
        valid.push(relative);
      } catch (error) {
        invalid.push({ source: relative, reason: error.message });
      }
    }
    validSources.set(season.number, uniqueImages(valid, season.number, mapping));
    invalidSources.set(season.number, invalid);
    if (invalid.length) console.log(`S${season.number} : ${invalid.length} fichier(s) image illisible(s), ignoré(s)`);
  }

  // Générer à part : un échec d'encodage ne doit pas effacer les visuels du site.
  OUT = await mkdtemp(path.join(ROOT, 'src/assets/.generated-'));
  if (requested) {
    await cp(DESTINATION, OUT, { recursive: true });
    for (const dir of ['packshots', 'dos', 'photos', 'episodes']) {
      for (const name of await readdir(path.join(OUT, dir))) {
        const number = Number(name.match(/^s(\d+)-/)?.[1]);
        if (requested.has(number)) await rm(path.join(OUT, dir, name));
      }
    }
  }
  await mkdir(path.join(OUT, 'packshots'), { recursive: true });
  await mkdir(path.join(OUT, 'photos'), { recursive: true });
  await mkdir(path.join(OUT, 'episodes'), { recursive: true });
  await mkdir(path.join(OUT, 'integrales'), { recursive: true });
  await mkdir(path.join(OUT, 'dos'), { recursive: true });

  let totalIn = 0;
  let totalOut = 0;

  for (const season of seasons) {
    const entry = { packshots: {}, dos: {}, photos: [], photoEpisodes: [], photoSources: [], episodes: {}, episodeSources: {} };

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

    const files = season.photos.filter((p) => /\.(jpe?g|png|tiff?)$/i.test(p));
    const available = validSources.get(season.number);
    const episodeNumbers = new Set((guide[String(season.number)]?.episodes ?? []).map((e) => e.numero));

    // Photos rattachées à un épisode : elles illustrent le guide.
    const byEpisode = new Map();
    for (const { relative: rel, episode } of available) {
      if (!episode || !episodeNumbers.has(episode)) continue;
      const list = byEpisode.get(episode) ?? [];
      if (list.length < PHOTOS_PER_EPISODE) {
        list.push(rel);
        byEpisode.set(episode, list);
      }
    }

    for (const [episode, files] of [...byEpisode].sort((a, b) => a[0] - b[0])) {
      entry.episodes[episode] = [];
      entry.episodeSources[episode] = files;
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
    const pool = available.filter(({ relative }) => !used.has(relative));
    const source = pool.length >= PHOTOS_PER_SEASON ? pool : available;
    const step = Math.max(1, Math.floor(source.length / PHOTOS_PER_SEASON));
    const picked = source.filter((_, i) => i % step === 0).slice(0, PHOTOS_PER_SEASON);

    for (const [i, { relative: rel, episode }] of picked.entries()) {
      const src = path.join(SOURCE, rel);
      const name = `s${season.number}-${i + 1}.webp`;
      const size = await photo(src, path.join(OUT, 'photos', name));
      totalIn += (await stat(src)).size;
      totalOut += size;
      entry.photos.push(`photos/${name}`);
      entry.photoEpisodes.push(episode ?? null);
      entry.photoSources.push(rel);
    }

    manifest.seasons[season.number] = entry;
    const illustrated = Object.keys(entry.episodes).length;
    report.seasons[season.number] = {
      sourceImages: files.length,
      uniqueImages: available.length,
      illustratedEpisodes: illustrated,
      missingEpisodes: [...episodeNumbers].filter((n) => !entry.episodes[n]),
      unidentifiedImages: available.filter((image) => !image.episode).map((image) => image.relative),
      excludedImages: files.filter((rel) => identifyImage(rel, season.number, mapping).excluded),
      invalidImages: invalidSources.get(season.number),
    };
    process.stdout.write(
      `S${String(season.number).padEnd(2)} ${Object.keys(entry.packshots).length} packshot(s), ` +
        `${Object.keys(entry.dos).length} dos, ` +
        `${entry.photos.length} photo(s) de galerie, ` +
        `${illustrated} épisode(s) illustré(s)\n`,
    );
  }

  for (const [range, supports] of selectedIntegrales) {
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

  await rm(DESTINATION, { recursive: true, force: true });
  await rename(OUT, DESTINATION);
  OUT = undefined;
  await writeFile(
    path.join(ROOT, 'src/data/images.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8',
  );
  await writeFile(path.join(ROOT, 'src/data/image-import-report.json'), `${JSON.stringify(report, null, 2)}\n`);

  console.log(`\nSources ${kb(totalIn)} → web ${kb(totalOut)}`);
}

try {
  await main();
} finally {
  if (OUT) await rm(OUT, { recursive: true, force: true });
}
