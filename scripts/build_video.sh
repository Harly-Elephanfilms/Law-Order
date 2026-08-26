#!/usr/bin/env bash
# Prépare les vidéos de l'accueil à partir des masters de diffusion.
#
# Les masters font 1080p à 10-16 Mb/s (33 à 99 Mo) : impubliables tels quels.
# On en tire deux fichiers aux rôles distincts :
#   hero-loop.mp4    le teaser, muet et bouclé en fond de bandeau — doit être
#                    léger, il se charge à chaque visite ;
#   bande-annonce.mp4 la bande-annonce avec le son, chargée seulement si le
#                    visiteur la lance.
# et l'image d'attente affichée avant toute lecture.
set -euo pipefail

SOURCE="/Users/harly/Desktop/LAW & ORDER VOL. 3"
OUT="$(cd "$(dirname "$0")/.." && pwd)/public/media"
TEASER="$SOURCE/TEASER/TEASER_L&O_29s_DEF.mp4"
TRAILER="$SOURCE/BANDE ANNONCE/BA_LawAndOrder_S1_25_COURTE_DEF.mp4"

mkdir -p "$OUT"

echo "→ hero-loop.mp4 (teaser, muet)"
# Secondes 11,4 à 18,6 : le teaser s'ouvre sur un carton-titre et se ferme sur
# un visuel promotionnel, deux blocs de texte qui se superposeraient mal au
# titre du bandeau. Seule cette fenêtre est faite d'images de la série.
ffmpeg -y -loglevel error -ss 11.4 -t 7.2 -i "$TEASER" \
  -an -vf "scale=1280:-2" -c:v libx264 -preset slow -crf 30 \
  -profile:v high -pix_fmt yuv420p -movflags +faststart \
  "$OUT/hero-loop.mp4"

echo "→ bande-annonce.mp4 (avec le son)"
ffmpeg -y -loglevel error -i "$TRAILER" \
  -vf "scale=1280:-2" -c:v libx264 -preset slow -crf 26 \
  -profile:v high -pix_fmt yuv420p \
  -c:a aac -b:a 128k -ac 2 -movflags +faststart \
  "$OUT/bande-annonce.mp4"

echo "→ hero-poster.webp (image d'attente)"
# Seconde 12 : plan de prétoire. Le début du teaser est un carton-titre, qui
# ferait doublon avec le titre du bandeau, et la fin un visuel promotionnel.
# ffmpeg extrait la trame, sharp l'encode — le ffmpeg local n'a pas de WebP.
ffmpeg -y -loglevel error -ss 12 -i "$TEASER" -frames:v 1 \
  -vf "scale=1280:-2" "$OUT/hero-poster.png"
node -e "require('sharp')('$OUT/hero-poster.png').webp({quality:72}).toFile('$OUT/hero-poster.webp')" \
  && rm -f "$OUT/hero-poster.png"

echo
ls -lh "$OUT" | awk 'NR>1 {printf "%-24s %s\n", $9, $5}'
