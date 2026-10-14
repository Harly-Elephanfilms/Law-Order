import type { ImageMetadata } from 'astro';

import bookletData from '../data/booklet.json';
import earlyEpisodesData from '../data/early-episodes.json';
import episodesData from '../data/episodes.json';
import supplementsData from '../data/episode-supplements.json';
import imagesData from '../data/images.json';
import seasonsData from '../data/seasons.json';
import shopLinks from '../data/shop-links.json';

export type SupportId = 'dvd' | 'bluray';

export interface Edition {
  support: SupportId;
  label: string;
  ean?: string;
  url?: string;
  technique?: string[];
  supplements?: string[];
  packshot?: ImageMetadata;
  /** Dos de jaquette : accroche, résumé, caractéristiques et code-barres imprimés. */
  dos?: ImageMetadata;
}

export interface Episode {
  numero: number;
  titre: string;
  titreVo?: string;
  diffusion?: { chaine: string; date: string };
  credits: string[];
  resume?: string;
  resumeSourceUrl?: string;
  casting?: string;
  castingLabel?: string;
  notes: string[];
  /** Photos de production identifiées comme illustrant cet épisode. */
  images: ImageMetadata[];
}

export interface Role {
  acteur: string;
  role: string;
}

export interface Season {
  number: number;
  years: string;
  episodeCount?: number;
  resume?: string;
  accroche?: string;
  accrocheSecondaire?: string;
  editions: Edition[];
  photos: { image: ImageMetadata; episode?: number }[];
  href: string;
  /** Renseignés pour les saisons couvertes par un guide des épisodes (1 à 15). */
  starring: Role[];
  starringNotes: string[];
  episodes: Episode[];
}

const SUPPORT_LABELS: Record<SupportId, string> = {
  bluray: 'Blu-ray',
  dvd: 'DVD',
};

// Astro n'optimise que les images qu'il peut résoudre au build : on les charge
// donc en bloc depuis src/assets, où scripts/build_images.mjs les a déposées.
const assets = import.meta.glob<{ default: ImageMetadata }>(
  '../assets/generated/**/*.webp',
  { eager: true },
);

function asset(relative: string | undefined): ImageMetadata | undefined {
  if (!relative) return undefined;
  return assets[`../assets/generated/${relative}`]?.default;
}

/** « 6 DVD\n24 x 42 min. environ\n… » → une ligne par caractéristique. */
function lines(value: string | undefined): string[] | undefined {
  const items = value?.split('\n').map((l) => l.trim()).filter(Boolean);
  return items?.length ? items : undefined;
}

/**
 * Typographie française : apostrophe courbe, espace après une virgule oubliée,
 * espace fine insécable avant les ponctuations doubles, insécable après « et
 * avant ». Sans elle, un « : » se retrouve seul en début de ligne.
 */
export function typo(value: string): string {
  return value
    .replace(/'/g, '’')
    // Virgule collée au mot suivant, fréquente dans les fiches saisies à la main.
    .replace(/,(?=[a-zà-ÿA-ZÀ-Ý])/g, ', ')
    .replace(/\s+([;:!?])/g, ' $1')
    .replace(/«\s+/g, '« ')
    .replace(/\s+»/g, ' »');
}

/** typo() sur un champ que les sources ne renseignent pas toujours. */
const maybeTypo = (value?: string) => (value === undefined ? undefined : typo(value));

/** Ce que scripts/build_data.py écrit dans seasons.json. */
interface RawSeason {
  number: number;
  years: string;
  episodes?: number;
  resume?: string;
  accroche?: string;
  accroche_secondaire?: string;
  supports: Partial<
    Record<
      SupportId,
      { ean?: string; url?: string; technique?: string; supplements?: string[] }
    >
  >;
}

interface SeasonImages {
  packshots: Partial<Record<SupportId, string>>;
  dos: Partial<Record<SupportId, string>>;
  photos: string[];
  photoEpisodes?: (number | null)[];
  episodes: Record<string, string[]>;
}

interface ImageManifest {
  seasons: Record<string, SeasonImages | undefined>;
  integrales: Record<
    string,
    Partial<Record<SupportId, { ean: string; packshot: string; dos: string }>>
  >;
}

const images = imagesData as ImageManifest;
/** Ce que scripts/build_episodes.py écrit : le texte, sans les visuels. */
type RawEpisode = Omit<Episode, 'images'>;

/**
 * Trois sources couvrent les saisons 1 à 15 : Word (1–5), livret PDF (6–10)
 * et document ODT (11–15). Les informations absentes des sources restent vides.
 */
const guide = { ...earlyEpisodesData, ...bookletData, ...episodesData } as Record<
  string,
  { starring: Role[]; episodes: RawEpisode[]; notes?: string[] } | undefined
>;
const supplements = supplementsData.episodes as Record<string, Record<string, { titreVo: string; resume: string; sourceUrl: string }> | undefined>;

export const seasons: Season[] = (seasonsData as RawSeason[]).map((raw) => {
  const seasonImages = images.seasons[String(raw.number)];

  const editions = (['bluray', 'dvd'] as const)
    .flatMap((support) => {
      const data = raw.supports[support];
      if (!data) return [];
      return [
        {
          support,
          label: SUPPORT_LABELS[support],
          ean: data.ean,
          url: data.url,
          technique: lines(data.technique)?.map((line) => typo(line)),
          supplements: data.supplements?.length
            ? data.supplements.map((item) => typo(item))
            : undefined,
          packshot: asset(seasonImages?.packshots[support]),
          dos: asset(seasonImages?.dos[support]),
        } satisfies Edition,
      ];
    });

  return {
    number: raw.number,
    years: raw.years,
    episodeCount: raw.episodes,
    resume: maybeTypo(raw.resume),
    accroche: maybeTypo(raw.accroche),
    accrocheSecondaire: maybeTypo(raw.accroche_secondaire),
    editions,
    photos: (seasonImages?.photos ?? []).flatMap((relative, i) => {
      const image = asset(relative);
      return image ? [{ image, episode: seasonImages?.photoEpisodes?.[i] ?? undefined }] : [];
    }),
    href: `/toutes-les-saisons/saison-${raw.number}/`,
    starring: guide[String(raw.number)]?.starring ?? [],
    starringNotes: (guide[String(raw.number)]?.notes ?? []).map(typo),
    episodes: (guide[String(raw.number)]?.episodes ?? []).map((episode) => {
      const extra = !episode.resume ? supplements[String(raw.number)]?.[String(episode.numero)] : undefined;
      if (extra && extra.titreVo !== episode.titreVo) throw new Error(`Titre VO du complément incompatible : S${raw.number}E${episode.numero}`);
      return {
        ...episode,
        titre: typo(episode.titre),
        resume: maybeTypo(episode.resume ?? extra?.resume),
        resumeSourceUrl: extra?.sourceUrl,
        notes: episode.notes.map((note) => typo(note)),
        images: (seasonImages?.episodes[String(episode.numero)] ?? [])
          .map(asset)
          .filter((i): i is ImageMetadata => Boolean(i)),
      };
    }),
  };
});

export interface Integrale {
  range: string;
  label: string;
  editions: Edition[];
}

const integraleLinks = shopLinks.integrales as Record<string, Partial<Record<SupportId, string>>>;
export const integrales: Integrale[] = [...new Set([
  ...Object.keys(images.integrales),
  ...Object.keys(integraleLinks),
])].sort((a, b) => Number(a.split('-')[0]) - Number(b.split('-')[0])).map(
  (range) => ({
    range,
    label: `Intégrale des saisons ${range.replace('-', ' à ')}`,
    editions: (['bluray', 'dvd'] as const).map((support) => ({
      support,
      label: SUPPORT_LABELS[support],
      url: integraleLinks[range]?.[support],
      ean: images.integrales[range]?.[support]?.ean,
      packshot: asset(images.integrales[range]?.[support]?.packshot),
      dos: asset(images.integrales[range]?.[support]?.dos),
    })),
  }),
);

/** La phrase d'ouverture de chaque épisode, commune à toute la série. */
export const NARRATION = typo(
  'Dans le système pénal américain, le ministère public est représenté par deux groupes ' +
    'distincts, mais d’égale importance : la police, qui enquête sur les crimes, et le ' +
    'procureur, qui poursuit les criminels. Voici leurs histoires.',
);
