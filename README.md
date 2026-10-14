# lawandorder.shop

Site vitrine des intégrales *New York Police Judiciaire* (Law & Order) éditées par
Elephant Films. Site statique Astro : 21 pages de contenu et une page 404, aucune base de données, aucun back-office.

Les fiches des quinze saisons ne sont pas saisies à la main : elles sont **générées** à
partir des dossiers de production placés à côté de `site/`, qui font foi.

## Mettre à jour le site

```bash
npm install
npm run data           # relit les dossiers sources → src/data/seasons.json
npm run episodes       # guide des épisodes 11 à 15 (.odt) → src/data/episodes.json
npm run episodes:first # guide des épisodes 1 à 5 (.doc) → src/data/early-episodes.json
npm run booklet        # guide des épisodes 6 à 10 (livret PDF) → src/data/booklet.json
npm run essay          # textes de fond du livret et du guide → src/data/essay.json
npm run images         # packshots et photos → src/assets/generated/
npm run images:png     # convertit les .tif/.tiff/.till de S5 à S10 en PNG, originaux conservés
npm run images:update  # actualise S5 à S10 en conservant les autres masters déjà préparés
npm run images:update-first # actualise S1 à S4 et le coffret intégrale 11 à 15
npm run video          # teaser et bande-annonce → public/media/  (ffmpeg requis)
npm run build          # → dist/  (site public)
npm run build:release  # build public + contrôle des liens, images, anciennes URL et indexation
npm run build:preview  # → dist/  (sous-domaine de test : noindex + robots Disallow)
```

`npm run dev` sert le site en local sur http://localhost:4321.

La procédure de bascule et les vérifications du domaine réel figurent dans
[`LANCEMENT.md`](LANCEMENT.md). Les fiches de saison et True Crime offrent un sommaire
des épisodes. La visionneuse parcourt les images d’un épisode, d’une édition ou d’une
galerie avec les boutons et les flèches du clavier. Sur mobile, le menu se replie et
l’accueil utilise le poster ; le moteur GSAP et la vidéo de fond ne sont pas téléchargés.
Le menu et les liens restent accessibles sans JavaScript.

`src/data/episode-supplements.json` complète les 32 résumés absents des guides, sans
modifier leurs textes existants. Chaque complément est adapté en français de TVmaze,
vérifié contre le numéro et le titre original, crédité et publié sous CC BY-SA 4.0.
`/resumes-complementaires.json` expose uniquement ces compléments avec leurs sources.

## D'où viennent les données

| Source | Ce qu'elle fournit |
| --- | --- |
| Fiches FIP (`*.xlsx`) | résumé, accroche, bonus, caractéristiques techniques, EAN |
| Jaquettes (`*JaqDVD*.pdf`, `*JaqBD*.pdf`) | mêmes champs, pour les éditions sans FIP |
| `Saisons 11 à 15 - Guide des épisodes.odt` | les 120 épisodes des saisons 11 à 15 et la distribution |
| `Saisons 1 à 5 - Guide des épisodes.doc` | les 111 épisodes des saisons 1 à 5 et la distribution ; résumés et acteurs invités non renseignés pour S4E15–22 et S5 |
| `LIVRET/Livret_Law_S6a10-96p-hd.pdf` | les 115 épisodes des saisons 6 à 10, le générique de chacune, et les textes de fond de la page « La série » |
| `PACKSHOTS 3D/`, `PHOTOS/`, `PNG/` | visuels des coffrets et photos de production |
| `VISUELS 2D/`, `2D/` (`*-Dos.jpg`) | dos de jaquette : accroche, résumé, caractéristiques, code-barres |
| `TEASER/`, `BANDE ANNONCE/` | vidéos du bandeau d'accueil |
| Page catégorie Elephant Films | liens d'achat DVD et Blu-ray |

Les images viennent des dossiers `PHOTOS/` et `PNG/` de chaque saison. `npm run images`
actualise leur inventaire et retrouve les boîtiers et dos renommés, sans réécrire les
textes ni les caractéristiques techniques.

Une photo est rattachée à son épisode par son nom (`Ep18_WHITELIE_…png`,
`@Ep2-Law3.jpg`) ou par un code de production **vérifié** dans
`src/data/episode-image-mapping.json`. Les codes ne suivent pas l'ordre de diffusion :
`E5302` désigne S15E06, et non S15E02. La table corrige aussi les préfixes inversés
des captures S13E23/S13E24. Toute autre contradiction interrompt l'import.

Deux images distinctes sont retenues par épisode ; les doublons `PHOTOS/PNG` ne
consomment pas les deux places. Les images sans correspondance restent dans la
galerie de saison, sans numéro d'épisode inventé. Les captures de *New York Cour de
justice* présentes dans S15 sont exclues des images de *Police judiciaire*.
Le manifeste `images.json` conserve les chemins sources de chaque sélection ;
`image-import-report.json` liste les épisodes sans image, les fichiers non attribués
et les images illisibles (notamment les fichiers vides), exclues avant la sélection.
Les nouveaux masters sont préparés dans un dossier temporaire avant de remplacer
la génération précédente.
`npm run test:images` vérifie les correspondances et les cas ambigus.

La conversion PNG conserve la résolution et vérifie l'égalité des pixels décodés.
Pour convertir d'autres saisons : `npm run images:png -- 11 12`.
Une actualisation ciblée permet de travailler quand les autres dossiers sources ont
été archivés : les scripts d'inventaire et de préparation acceptent tous deux
`--seasons=5,6,7,8,9,10`. L'import complet `npm run images` demande toutes les sources.
Le script de préparation accepte aussi `--integrales=11-15` pour ajouter ou actualiser
ce coffret dans le même import ciblé. Les intégrales sont affichées dès que leurs
visuels sont préparés ; les boutons de commande apparaissent lorsque les liens
produit vérifiés sont renseignés dans `shop-links.json`.

Chaque édition, DVD comme Blu-ray, expose son boîtier 3D — et sur les fiches saison le dos
de sa jaquette, l'un et l'autre agrandissables (`src/components/EditionVisuals.astro`). Les
cartes d'intégrale de l'accueil s'en tiennent au boîtier (`montrerDos={false}`) : à cette
taille le dos ne se lit pas et alourdit la carte.

Les visuels des trois coffrets intégrales ne se déduisent d'aucune saison : leurs chemins
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

Le guide des épisodes couvre les saisons 1 à 15, de trois sources distinctes que
`src/lib/seasons.ts` réunit. `build_early_episodes.py` extrait le `.doc` avec
`textutil` sur macOS ; ailleurs, `--text chemin.txt` accepte une extraction UTF-8.
Les deux parties de « La loi du silence / L’empire du crime » ont chacune leur
titre et leur date de diffusion ; résumé et distribution communs sont signalés.
Les champs vides de S4E15–22 et S5 restent absents, et la remarque de S5E19 reste une note.
`npm run test:episodes-first` vérifie ces cas et le rejet des imports incomplets.
Les deux parties de « Mafia russe », réunies dans le
livret de S9, sont extraites séparément pour recevoir leurs propres images.
S10E24 est absent du PDF fourni : ses métadonnées vérifiées sont complétées dans
`src/data/booklet.overrides.json`, avec leurs sources, pour afficher ses captures.

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

**La galerie des saisons** (`src/components/SeasonFilmstrip.astro`) est une grille qui
s'enroule sur autant de lignes que nécessaire — le même balisage, quel que soit le
mouvement autorisé, sans défilement séparé à réapprendre ni vignette coupée en bord de
cadre. Sur grand écran avec un pointeur fin, les vignettes gagnent une légère distorsion au
survol (`src/lib/hoverDistort.ts`) : un unique contexte WebGL Three.js, déplacé d'une
vignette à l'autre plutôt que multiplié par quinze, chargé à la demande au premier survol
(jamais pour les écrans tactiles ni en mouvement réduit).

Le bandeau d'accueil s'épingle brièvement pendant un zoom lent du fond, plafonné pour ne
jamais devenir un noir uni (la section suivante, elle aussi sombre, enchaînerait sans
transition perceptible) ; cet épinglage est réservé au grand écran.

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
| `scripts/build_early_episodes.py` | extrait le guide des saisons 1 à 5 du `.doc`, écrit `early-episodes.json` |
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
