import path from 'node:path';

// Ep2-Law3, @Ep05_LawOrder et Ep18_WHITELIE sont tous des numéros explicites.
const EPISODE_IN_NAME = /(?:^|[@_-])Ep(\d{1,2})(?:[_-]|$)/i;
const PRODUCTION_IN_NAME = /(?:^|[_-])(E\d{4}|K\d{4}|\d{5})(?=[_.-]|$)/i;

export function identifyImage(relative, season, mapping) {
  const name = path.basename(relative);
  if (/LawOrderTrialbyJury/i.test(name)) return { excluded: 'New York Cour de justice' };
  if (/HomicideLifeontheStreets?/i.test(name)) return { excluded: 'Homicide' };
  if (/LawOrderSpecialVictimsUnit/i.test(name)) return { excluded: 'New York Unité spéciale' };
  const labeled = name.match(EPISODE_IN_NAME);
  const production = name.match(PRODUCTION_IN_NAME)?.[1].toUpperCase();
  const config = mapping.seasons[String(season)] ?? {};
  const codeIndex = config.orderedCodes?.indexOf(production) ?? -1;
  const verified = config.codes?.[production] ?? (codeIndex >= 0 ? codeIndex + 1 : undefined);
  const episodeInName = labeled ? Number(labeled[1]) : undefined;
  if (verified && episodeInName && verified !== episodeInName &&
      config.filenameEpisodeOverrides?.[production] !== episodeInName) {
    throw new Error(`Correspondance contradictoire S${season} : ${name}`);
  }
  return { episode: verified ?? episodeInName, production };
}

export function uniqueImages(files, season, mapping) {
  // Préférer le PNG source à son doublon JPEG dans PHOTOS.
  const sorted = [...files].sort((a, b) => {
    const rank = (p) => (p.split('/').includes('PNG') ? 0 : 2) + (/\.png$/i.test(p) ? 0 : 1);
    return rank(a) - rank(b) || a.localeCompare(b, 'en');
  });
  const seen = new Set();
  return sorted.flatMap((relative) => {
    const identity = identifyImage(relative, season, mapping);
    if (identity.excluded) return [];
    const stem = path.basename(relative, path.extname(relative)).replace(/^@/, '');
    const frame = stem.match(/\d{2}_\d{2}_\d{2}_\d{2}\.Still\d+/i)?.[0];
    const key = frame ? `${identity.production ?? identity.episode}:${frame}` : stem;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ relative, ...identity }];
  });
}
