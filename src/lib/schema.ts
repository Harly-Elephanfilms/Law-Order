/**
 * Données structurées schema.org.
 *
 * Elles disent aux moteurs de recherche ce que ces pages décrivent : une série,
 * ses saisons, ses épisodes, et les coffrets qui les éditent. Sans elles, une
 * fiche saison n'est qu'un texte parmi d'autres.
 *
 * Les coffrets sont décrits sans `offers` : une offre sans prix est refusée par
 * Google, et les prix sont ceux d'Elephant Films, qui peut les changer sans
 * nous prévenir.
 */
import type { Integrale, Season } from './seasons';

const SITE = 'https://lawandorder.shop';

const SERIE = {
  '@type': 'TVSeries',
  '@id': `${SITE}/#serie`,
  name: 'New York Police Judiciaire',
  alternateName: 'Law & Order',
  inLanguage: 'fr-FR',
  countryOfOrigin: { '@type': 'Country', name: 'États-Unis' },
  creator: { '@type': 'Person', name: 'Dick Wolf' },
  numberOfSeasons: 15,
} as const;

const EDITEUR = { '@type': 'Organization', name: 'Elephant Films' } as const;

const absolu = (chemin: string) => new URL(chemin, SITE).href;

/** Le coffret d'une saison ou d'une intégrale, identifié par son code EAN. */
function produit(nom: string, edition: Season['editions'][number]) {
  return {
    '@type': 'Product',
    name: `${nom} — coffret ${edition.label}`,
    ...(edition.ean && { gtin13: edition.ean }),
    ...(edition.packshot && { image: absolu(edition.packshot.src) }),
    brand: EDITEUR,
    category: 'DVD et Blu-ray',
    ...(edition.url && { sameAs: edition.url }),
  };
}

export function schemaSaison(season: Season) {
  const nom = `New York Police Judiciaire — saison ${season.number}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'TVSeason',
        name: nom,
        seasonNumber: season.number,
        partOfSeries: SERIE,
        ...(season.episodeCount && { numberOfEpisodes: season.episodeCount }),
        ...(season.resume && { description: season.resume }),
        ...(season.editions[0]?.packshot && {
          image: absolu(season.editions[0].packshot.src),
        }),
        ...(season.episodes.length && {
          episode: season.episodes.map((episode) => ({
            '@type': 'TVEpisode',
            episodeNumber: episode.numero,
            name: episode.titre,
            ...(episode.titreVo && { alternateName: episode.titreVo }),
            ...(episode.resume && { description: episode.resume }),
          })),
        }),
      },
      ...season.editions.map((edition) => produit(nom, edition)),
    ],
  };
}

export function schemaAccueil(integrales: Integrale[]) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', url: SITE, name: 'Law&Order.shop', inLanguage: 'fr-FR' },
      SERIE,
      ...integrales.flatMap((integrale) =>
        integrale.editions.map((edition) => produit(integrale.label, edition)),
      ),
    ],
  };
}

export function schemaTrueCrime(nom: string, description: string, image: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'TVSeries',
    name: nom,
    inLanguage: 'fr-FR',
    countryOfOrigin: { '@type': 'Country', name: 'États-Unis' },
    numberOfEpisodes: 8,
    description,
    image: absolu(image),
  };
}
