# lawandorder.shop

Site vitrine des intégrales *New York Police Judiciaire* (Law & Order) éditées par
Elephant Films. Site statique Astro : 21 pages, aucune base de données, aucun back-office.

Les fiches des quinze saisons ne sont pas saisies à la main : elles sont **générées** à
partir des dossiers de production (`~/Desktop/LAW & ORDER VOL. 3`), qui font foi.

## Mettre à jour le site

```bash
npm install
npm run data           # relit les dossiers sources → src/data/seasons.json
npm run episodes       # guide des épisodes 11 à 15 (.odt) → src/data/episodes.json
npm run booklet        # guide des épisodes 6 à 10 (livret PDF) → src/data/booklet.json
npm run essay          # textes de fond du livret et du guide → src/data/essay.json
npm run images         # packshots et photos → src/assets/generated/
npm run video          # teaser et bande-annonce → public/media/  (ffmpeg requis)
npm run build          # → dist/  (site public)
npm run build:preview  # → dist/  (sous-domaine de test : noindex + robots Disallow)
```

`npm run dev` sert le site en local sur http://localhost:4321.

## D'où viennent les données

| Source | Ce qu'elle fournit |
| --- | --- |
| Fiches FIP (`*.xlsx`) | résumé, accroche, bonus, caractéristiques techniques, EAN |
| Jaquettes (`*JaqDVD*.pdf`, `*JaqBD*.pdf`) | mêmes champs, pour les éditions sans FIP |
| `Saisons 11 à 15 - Guide des épisodes.odt` | les 120 épisodes des saisons 11 à 15 et la distribution |
| `LIVRET/Livret_Law_S6a10-96p-hd.pdf` | les 115 épisodes des saisons 6 à 10, le générique de chacune, et les textes de fond de la page « La série » |
| `PACKSHOTS 3D/`, `PHOTOS/`, `PNG/` | visuels des coffrets et photos de production |
| `VISUELS 2D/`, `2D/` (`*-Dos.jpg`) | dos de jaquette : accroche, résumé, caractéristiques, code-barres |
| `TEASER/`, `BANDE ANNONCE/` | vidéos du bandeau d'accueil |
| Page catégorie Elephant Films | liens d'achat DVD et Blu-ray |

Une photo n'illustre un épisode que si son nom le désigne : `Ep18_WHITELIE_…png`.
C'est le seul lien fiable entre une image et un épisode — les codes de production
(`E1304`) ne suivent pas l'ordre de diffusion et ne sont pas interprétés. Déposer des
fichiers ainsi nommés dans le `PHOTOS/` d'une saison suffit à illustrer son guide :
`npm run images` les reprend, deux par épisode.

Chaque édition, DVD comme Blu-ray, expose son boîtier 3D — et sur les fiches saison le dos
de sa jaquette, l'un et l'autre agrandissables (`src/components/EditionVisuals.astro`). Les
cartes d'intégrale de l'accueil s'en tiennent au boîtier (`montrerDos={false}`) : à cette
taille le dos ne se lit pas et alourdit la carte.

Les visuels des deux coffrets intégrales ne se déduisent d'aucune saison : leurs chemins
sont nommés un par un en tête de `build_images.mjs` (constante `INTEGRALES`). On y retient
le boîtier seul, pas la composition avec les saisons dépliées — celle de l'intégrale 1 à 5
porte un macaron « Exclusivité Fnac ».

Les packshots retenus sont les **PNG détourés** — jamais les JPG du même dossier, aplatis
sur blanc : le site les pose sur fond sombre, sans cadre. `build_images.mjs` refuse une
source opaque plutôt que de la publier avec un fond blanc.

La FIP prime toujours ; la jaquette ne comble que ses trous. Ce que ni l'une ni l'autre ne
donne se saisit dans **`src/data/seasons.overrides.json`**, qui a le dernier mot (c'est le
seul fichier de données à modifier à la main ; les autres sont régénérés).

`npm run data` termine par deux listes : les champs manquants (un coffret sans packshot,
sans dos, sans EAN, sans lien d'achat ou sans caractéristiques y apparaît nommément) et les
**désaccords entre sources**, quand les fiches DVD et Blu-ray d'une même saison se
contredisent. Chaque désaccord doit être tranché dans `seasons.overrides.json` ; le rapport
signale ceux qui ne le sont pas encore.

La page « La série » réunit deux textes : l'introduction et les portraits du livret des
saisons 6 à 10, puis l'essai sur la distribution du guide des saisons 11 à 15.

`build_essay.py` lit de la prose, non des fiches : aucune étiquette n'y marque la fin d'un
paragraphe. Il s'appuie donc sur la position verticale de chaque ligne — 12,3 points
d'interligne dans un paragraphe, davantage à chaque rupture — pour rétablir paragraphes et
intertitres. Les fragments en italique sont des blocs de texte distincts : leurs espaces
doivent être préservées, sans quoi « la série » et le titre d'œuvre qui suit se soudent.

Le guide des épisodes couvre les saisons 6 à 15, de deux sources distinctes que
`src/lib/seasons.ts` réunit. Le livret compte 22 fiches pour la saison 9 et 23 pour la
saison 10, là où les coffrets annoncent 24 épisodes : ses épisodes en deux parties sont
traités en une seule fiche.

Un seul cas à ce jour : la FIP Blu-ray de la saison 6 annonce 24 épisodes et 24 × 48 min,
là où les deux jaquettes imprimées et la fiche produit Elephant Films (1104 min) donnent
23 épisodes. C'est le packaging qui fait foi.

## Mouvement

L'accueil (bandeau, section « statement », galerie des saisons) et, plus légèrement, les
autres pages (fiches saison, La série, True Crime, catalogue) portent des révélations et
parallaxes au scroll. Trois principes gouvernent l'ensemble :

1. **Le contenu existe sans le mouvement.** Chaque page rendue par Astro est complète,
   lisible et navigable sans une ligne de JavaScript. Le mouvement s'ajoute par-dessus, il
   ne conditionne jamais l'accès à un lien, une image ou un texte.
2. **Rien n'est caché avant que le script qui le révèle soit prêt.** `src/lib/motion.ts`
   (chargé sur chaque page, quelques lignes) décide si le mouvement est permis —
   préférence système `prefers-reduced-motion`, ou bascule explicite dans l'en-tête,
   mémorisée en `localStorage` sous `law-order:motion`. Seulement si permis, il charge
   `src/lib/motionEngine.ts` (GSAP, ScrollTrigger, SplitText, Lenis) qui masque puis révèle
   les éléments marqués `data-reveal` — jamais l'inverse.
3. **Trois niveaux de dégradation, pas un seul interrupteur.** Mouvement refusé → page
   statique, sections toujours visibles. Mouvement permis mais écran étroit ou pointeur
   tactile → révélations et parallaxe, mais ni épinglage ni distorsion (`WIDE_SCREEN` et
   `FINE_POINTER` dans motionEngine.ts). Écran large, pointeur fin, mouvement permis →
   mise en scène complète.

**Attributs disponibles dans les gabarits**, posés dans le HTML et interprétés par
motionEngine.ts — aucun ne dépend d'un composant Astro dédié :

| Attribut | Effet |
| --- | --- |
| `data-reveal` | fondu et léger décalage vertical à l'entrée dans le viewport |
| `data-reveal="clip"` | l'image se découvre du bas vers le haut plutôt qu'un fondu |
| `data-reveal-group` (sur un ancêtre) | les `data-reveal` qu'il contient se révèlent en cascade |
| `data-parallax="18"` | décalage vertical (en % de l'élément) sur sa traversée du viewport |

**La galerie horizontale des saisons** (`src/components/SeasonFilmstrip.astro`) est le
même balisage — une rangée de vraies vignettes, chacune un vrai lien — quel que soit le
mouvement autorisé : `overflow-x:auto` et `scroll-snap` natifs par défaut (tactile et
clavier compris), transformée en galerie épinglée qui défile à l'horizontale seulement sur
grand écran avec mouvement permis. Les vignettes gagnent alors une légère distorsion au
survol (`src/lib/hoverDistort.ts`) : un unique contexte WebGL Three.js, déplacé d'une
vignette à l'autre plutôt que multiplié par quinze, chargé à la demande au premier survol
(jamais pour les écrans tactiles ni en mouvement réduit). Le focus clavier sur une vignette
hors champ ramène la galerie à sa position, exactement comme le ferait le défilement natif
que la version épinglée remplace.

Le bandeau d'accueil s'épingle brièvement pendant un zoom lent du fond, plafonné pour ne
jamais devenir un noir uni (la section suivante, elle aussi sombre, enchaînerait sans
transition perceptible) ; ce bref épinglage, comme celui de la galerie, est lui aussi
réservé au grand écran.

## Ajouter une saison

1. Déposer le dossier `SAISON 16` dans les sources, avec ses `PACKSHOTS 3D`, `PHOTOS` et
   sa FIP ou sa jaquette.
2. `python3 scripts/fetch_shop_links.py` — relève le lien produit chez Elephant Films.
   Les identifiants (`…-c2x42902084`) changent à chaque référence : ils ne se devinent pas.
3. `npm run data && npm run images && npm run build`.
4. Si le guide des épisodes est étendu à cette saison, `npm run episodes` — la fiche
   affiche alors la distribution et le guide, comme les saisons 11 à 15.

La page `/toutes-les-saisons/saison-16/`, sa vignette et son entrée de sitemap suivent
sans autre intervention. Il faut cependant étendre `range(1, 16)` dans
`scripts/build_data.py`.

## Scripts

| Fichier | Rôle |
| --- | --- |
| `scripts/build_data.py` | inventorie les sources, lit FIP et jaquettes, écrit `seasons.json` |
| `scripts/build_episodes.py` | extrait le guide des saisons 11 à 15 du `.odt`, écrit `episodes.json` |
| `scripts/build_booklet.py` | extrait le guide des saisons 6 à 10 du livret, écrit `booklet.json` |
| `scripts/build_essay.py` | extrait les textes de fond des deux documents, écrit `essay.json` |
| `scripts/fetch_shop_links.py` | relève les liens d'achat, écrit `shop-links.json` |
| `scripts/build_images.mjs` | packshots détourés, photos de galerie et images d'épisode |
| `scripts/build_video.sh` | boucle du bandeau, bande-annonce et image d'attente |

Toutes les photos s'agrandissent au clic (`src/components/Photo.astro` +
`Lightbox.astro`). La vignette est un lien vers la version grand format : sans
JavaScript, l'image s'ouvre simplement dans l'onglet.

Le bandeau d'accueil joue une boucle muette de 7 s (477 Ko) tirée du teaser, et charge la
bande-annonce sonore (2,3 Mo) seulement si le visiteur la lance. Les masters de diffusion
font 33 à 99 Mo : ils ne sont jamais publiés tels quels.

## Référencement et partage

Chaque page déclare une vignette de partage (`og:image`, produite en JPEG depuis le
packshot de la page) et des données structurées schema.org : `TVSeason` avec ses épisodes
sur les fiches saison, `Product` avec code EAN pour chaque coffret, `TVSeries` sur
l'accueil. Les coffrets sont décrits **sans `offers`** : une offre sans prix est rejetée
par Google, et les prix sont ceux d'Elephant Films.

## Cache

`public/.htaccess` demande au navigateur de revalider le HTML à chaque visite
(`no-cache, must-revalidate`). Sans cette règle, une page déjà téléchargée continue de
s'afficher après une mise en ligne — les adresses des pages, elles, ne changent pas d'une
version à l'autre.

Les fichiers de `/_astro/` portent une empreinte de leur contenu dans leur nom et peuvent
être gardés longtemps. Le fichier demande un an ; le serveur Hostinger impose sa propre
valeur (7 jours), ce qui convient tout autant.

## Mise en ligne

Hébergement Hostinger, compte `u788632281`.

### Sous-domaine de test

<https://preview.lawandorder.shop> — répertoire
`domains/lawandorder.shop/public_html/preview`, séparé du WordPress.

```bash
npm run build:preview
```

puis déploiement de `dist/` sur le domaine `preview.lawandorder.shop`. **Toujours
construire avec `build:preview` pour cette cible** : la préversion sert une copie
complète du site et doit rester hors des moteurs de recherche.

### Site public

`npm run build`, puis déploiement de `dist/` sur `lawandorder.shop`. Le contenu de
`dist/` remplace celui de `public_html/`.

**Le WordPress actuel occupe ce répertoire.** Il doit être sauvegardé avant tout
déploiement : le site statique ne le remplace pas en douceur, il prend sa place.
Attention, `public_html/preview/` disparaîtrait aussi — recréer le sous-domaine
après la bascule si on veut le conserver.

Les URL des saisons et celle de True Crime reprennent celles du site WordPress
(`/toutes-les-saisons/saison-N/`, `/law-order-true-crime/`), déjà indexées.
