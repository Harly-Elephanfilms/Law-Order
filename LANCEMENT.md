# Mise en ligne de Law and Order

Les 12 adresses publiques relevées dans l’API WordPress le 14 octobre 2026
sont conservées. `src/data/legacy-routes.json` en garde la liste ; le contrôle
du build vérifie chacune d’elles. Les liens des deux éditions du coffret
11 à 15 restent à ajouter dans `src/data/shop-links.json`.

## Construire et contrôler

```bash
npm run test:images
npm run test:episodes
npx tsc --noEmit
npm run build:release
```

`build:release` produit le site public dans `dist/` et vérifie les liens locaux,
les ancres, les variantes d’images, les anciennes adresses, le favicon, la page 404,
le sitemap et l’absence de blocage d’indexation sur les pages publiques.
Les résumés complémentaires sont adaptés de TVmaze et distribués sous CC BY-SA 4.0 ;
les crédits figurent sur les fiches concernées et dans les mentions légales.

Pour la préversion, utiliser `npm run build:preview && npm run check:preview`.
Elle reste volontairement non indexable. Ne pas envoyer ce build sur le domaine public.

## Passer de WordPress au site statique

1. Sauvegarder les fichiers de l’ancien WordPress, sa base de données et le dossier
   du sous-domaine de préversion. Vérifier que la sauvegarde est récupérable.
2. Après validation du site, publier le contenu du build public `dist/`, y compris
   `.htaccess`, sur `lawandorder.shop`. Garder le sous-domaine de préversion séparé.
3. Contrôler sur le domaine réel les 12 anciennes adresses, HTTPS, les liens d’achat,
   une adresse inexistante (réponse HTTP 404 et page dédiée), le sitemap et `robots.txt`.
4. Ajouter le sitemap à Google Search Console. Mesurer l’accueil et une fiche de saison
   avec PageSpeed Insights, puis contrôler les visites réelles lorsqu’elles seront disponibles.

Aucune mise en ligne ni modification de l’hébergement n’est effectuée par les scripts de build.
La vidéo de fond et GSAP ne sont pas chargés sur téléphone ; Three.js est différé
jusqu’au premier survol de la galerie sur ordinateur. Les performances sous réseau
mobile doivent encore être mesurées sur le domaine de préversion ou public.
