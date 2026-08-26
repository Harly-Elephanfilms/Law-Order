#!/usr/bin/env python3
"""Extrait les textes de fond des deux documents de travail.

Deux parties, deux sources :

  1. le livret de l'intégrale des saisons 6 à 10 (PDF) — introduction sur
     l'expansion de la franchise, puis portraits de personnages et d'acteurs ;
  2. le guide des épisodes des saisons 11 à 15 (ODT) — un essai sur les entrées
     et sorties de la distribution, suivi d'autres portraits.

Le second est simple à lire : l'ODF connaît la notion de paragraphe. Le premier
non, d'où tout ce qui suit.

Ce qui suit ne concerne que le livret :

Le livret du coffret 6 à 10 s'ouvre sur une dizaine de milliers de mots avant
son guide des épisodes. Contrairement au guide, il s'agit de prose suivie : ni
étiquette ni ponctuation ne signale la fin d'un paragraphe.

La mise en page, elle, le signale. Les lignes d'un même paragraphe sont
espacées de 12,3 points ; une rupture creuse l'écart. On lit donc la position
verticale de chaque ligne plutôt que son contenu, et l'on rétablit ainsi les
paragraphes et les intertitres.
"""
import html
import json
import re
import sys
import zipfile
from collections import defaultdict
from pathlib import Path

from pypdf import PdfReader

SOURCE = Path(
    "/Users/harly/Desktop/LAW & ORDER VOL. 3/LIVRET/Livret_Law_S6a10-96p-hd.pdf"
)
SOURCE_ODT = Path(
    "/Users/harly/Desktop/LAW & ORDER VOL. 3/Saisons 11 à 15 - Guide des épisodes.odt"
)
# L'essai de l'ODT s'ouvre sur ce titre et s'achève au premier guide de saison.
# Le document ponctue déjà à la française : le deux-points est précédé d'une
# espace insécable, qu'il ne faut donc pas attendre dans le repère.
DEBUT_ODT = "Entrées et sorties dans New York Police Judiciaire"
FIN_ODT = re.compile(r"^Saison \d+ \(\d{4}")
ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / "src/data/essay.json"

DEBUT = "INTRODUCTION"
FIN = "GUIDE DES ÉPISODES"
# Titre courant répété en tête de chaque page de la seconde partie, précédé du
# numéro de page — que la composition redouble (« 1616 »).
TITRE_COURANT = re.compile(r"^\d*\s*LES PERSONNAGES\s*/\s*LES ACTEURS\s*$")
# « INSPECTEUR ED GREENSAISONS 10 À 18 » : le rôle, sa fonction et ses saisons
# sont composés côte à côte, sans espace entre les blocs.
INTITULES_ACCOLES = re.compile(r"(?<=[A-ZÀ-Ý])(SUBSTITUT|SAISONS?\b)")
# Interligne courant du livret ; au-delà, le paragraphe est clos.
INTERLIGNE = 13.5
# Écart vertical en deçà duquel deux fragments sont sur la même ligne.
TOLERANCE_LIGNE = 4.0
# Un intertitre tient sur une ligne, ne s'achève pas comme une phrase et
# s'accompagne d'une respiration plus large que celle d'un paragraphe.
RESPIRATION_DE_TITRE = 16.0


def lignes_positionnees(path):
    """(y, texte) pour chaque ligne d'une page, dans l'ordre de lecture.

    Trois pièges, qui coûtent chacun des morceaux de phrase :

    - un fragment en italique est un fragment de texte distinct, avec ses
      espaces de part et d'autre. Les supprimer souderait « série » et le titre
      d'œuvre qui suit ;
    - certains fragments sont positionnés relativement et rapportent une
      ordonnée nulle : ils appartiennent à la ligne précédente ;
    - un exposant (« 20e ») est légèrement plus haut que sa ligne, d'où la
      tolérance au regroupement.
    """
    pages = []
    for page in PdfReader(path).pages:
        fragments = []

        def visiteur(text, cm, tm, font_dict, font_size, fragments=fragments):
            if text and text.strip():
                fragments.append((tm[5], text))

        page.extract_text(visitor_text=visiteur)

        derniere_y = None
        situes = []
        for y, text in fragments:
            if y <= 0 and derniere_y is not None:
                y = derniere_y
            else:
                derniere_y = y
            situes.append((y, text))

        lignes = []
        for y, text in situes:
            if lignes and abs(lignes[-1][0] - y) <= TOLERANCE_LIGNE:
                lignes[-1] = (max(lignes[-1][0], y), lignes[-1][1] + text)
            else:
                lignes.append((y, text))
        pages.append([(y, re.sub(r"\s+", " ", t).strip()) for y, t in lignes if t.strip()])
    return pages


def reparer(texte):
    """Répare ce que la composition a défait.

    Les césures de fin de ligne d'abord (« la qua- lité »), puis les espaces
    perdues à la jointure de deux fragments de style : « Law & OrderNew York ».
    Le seuil de trois minuscules épargne les patronymes en McCoy ou DiCenzo.
    """
    texte = re.sub(r"(\w)\s?-\s+(\w)", r"\1\2", texte)
    texte = re.sub(r"(?<=[a-zà-ÿ]{3})(?=[A-ZÀ-Ý][a-zà-ÿ]{2})", " ", texte)
    # Le folio est composé deux fois et se colle au début du bloc : « 2525 Créé
    # par… ». Le doublement le distingue d'un nombre appartenant au texte.
    return re.sub(r"^(\d{1,3})\1\s*", "", texte)


def blocs(pages):
    """Regroupe les lignes en paragraphes et intertitres."""
    resultat = []
    courant, ecart_avant = [], None

    def clore(ecart_apres=None):
        if not courant:
            return
        texte = reparer(" ".join(courant)).strip()
        if not texte:
            courant.clear()
            return
        court = len(texte) < 80 and not texte.endswith((".", "!", "?", "»", "…"))
        titre = len(courant) == 1 and court and (
            (ecart_avant or 0) >= RESPIRATION_DE_TITRE
            # Les intitulés de partie sont composés en capitales ; certains ne
            # sont pas précédés d'une respiration suffisante pour se trahir.
            or texte == texte.upper()
        )
        resultat.append({"type": "titre" if titre else "paragraphe", "texte": texte})
        courant.clear()

    for lignes in pages:
        precedent = None
        for y, texte in lignes:
            if re.fullmatch(r"\d{1,3}", texte):  # numéro de page
                continue
            ecart = None if precedent is None else precedent - y
            if ecart is None or ecart > INTERLIGNE:
                clore(ecart)
                ecart_avant = ecart
            courant.append(texte)
            precedent = y
        clore()
        if resultat:
            resultat[-1]["fin_de_page"] = True

    # Un paragraphe coupé par un changement de page ou une illustration doit
    # être recollé. Le signal est sûr : dans cette prose, un paragraphe ne
    # commence jamais par une minuscule, et la phrase interrompue n'est pas
    # ponctuée.
    recollee = []
    for bloc in resultat:
        bloc.pop("fin_de_page", None)
        precedent = recollee[-1] if recollee else None
        if (
            precedent
            and bloc["type"] == precedent["type"] == "paragraphe"
            and bloc["texte"][:1].islower()
            and not precedent["texte"].endswith((".", "!", "?", "»", "…", ":"))
        ):
            precedent["texte"] += " " + bloc["texte"]
        else:
            recollee.append(bloc)
    return recollee


def paragraphes_odt(path):
    """Paragraphes de l'ODT. Les espaces `<text:s/>` bordent les italiques."""
    xml = zipfile.ZipFile(path).read("content.xml").decode("utf8")
    xml = re.sub(r"<text:(s|tab)\b[^>]*/>", " ", xml)
    xml = re.sub(r"</text:(p|h)>", "\n", xml)
    xml = re.sub(r"<[^>]+>", "", xml)
    lignes = (html.unescape(l) for l in xml.split("\n"))
    return [re.sub(r"[ \t]+", " ", l).strip() for l in lignes if l.strip()]


def essai_odt():
    """L'essai sur la distribution, et les portraits qui le suivent."""
    lignes = paragraphes_odt(SOURCE_ODT)
    debut = next(i for i, l in enumerate(lignes) if l.startswith(DEBUT_ODT))
    fin = next(i for i, l in enumerate(lignes) if FIN_ODT.match(l))

    # Le titre tient sur deux paragraphes, le second servant de sous-titre.
    corps = lignes[debut + 2 : fin]
    blocs = []
    for i, ligne in enumerate(corps):
        suivante = corps[i + 1] if i + 1 < len(corps) else ""
        # Un intertitre est bref, sans point final, et introduit un développement.
        titre = len(ligne) < 70 and not ligne.endswith(".") and len(suivante) > 200
        blocs.append({"type": "titre" if titre else "paragraphe", "texte": ligne.rstrip("\xa0 :")})
    return {
        "titre": lignes[debut].rstrip("\xa0 :"),
        "soustitre": lignes[debut + 1][:1].upper() + lignes[debut + 1][1:],
        "source": "Guide des épisodes des saisons 11 à 15",
        "blocs": blocs,
    }


def main():
    if not SOURCE.exists():
        print(f"Introuvable : {SOURCE}", file=sys.stderr)
        return 1

    tous = blocs(lignes_positionnees(SOURCE))
    # Le sommaire annonce les mêmes intitulés : le bon est le dernier.
    debut = max(i for i, b in enumerate(tous) if b["texte"] == DEBUT)
    # Le titre du guide clôt la partie rédactionnelle. Il s'est fondu dans le
    # dernier bloc — la fiche technique de la série — dont il faut le retirer.
    fin = next(i for i, b in enumerate(tous) if FIN in b["texte"] and i > debut)
    contenu = tous[debut + 1 : fin + 1]
    contenu[-1]["texte"] = contenu[-1]["texte"].replace(FIN, "").strip()

    # Le premier bloc est le titre de l'article, que la page compose elle-même.
    if contenu and contenu[0]["texte"].startswith("LAW &ORDER"):
        contenu.pop(0)

    contenu = [b for b in contenu if not TITRE_COURANT.match(b["texte"])]

    # Les intitulés de partie sont repris en bandeau sur chaque page de la
    # partie. On ne garde que leur première occurrence.
    vus = set()
    dedoublonne = []
    for bloc in contenu:
        if len(bloc["texte"]) < 70 and bloc["texte"] in vus:
            continue
        vus.add(bloc["texte"])
        dedoublonne.append(bloc)
    contenu = dedoublonne
    for bloc in contenu:
        bloc["texte"] = INTITULES_ACCOLES.sub(r" — \1", bloc["texte"])

    # La fiche technique de la série est composée deux fois sur sa page : la
    # seconde, d'un seul tenant, répète ce que les blocs précédents disent déjà.
    dernier = contenu[-1]["texte"]
    for precedent in contenu[:-1]:
        amorce = precedent["texte"][:15]
        if len(amorce) == 15 and (pos := dernier.find(amorce)) > 0:
            dernier = dernier[:pos].strip()
    contenu[-1]["texte"] = dernier

    parties = [
        {
            "titre": "Law & Order, un univers en expansion",
            "soustitre": "Continuité, crossovers et séries dérivées",
            "source": "Livret de l’intégrale des saisons 6 à 10",
            "blocs": contenu,
        },
        essai_odt(),
    ]

    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text(json.dumps(parties, ensure_ascii=False, indent=2) + "\n", encoding="utf8")

    total = sum(len(p["blocs"]) for p in parties)
    mots = sum(len(b["texte"].split()) for p in parties for b in p["blocs"])
    print(f"{DEST.relative_to(ROOT)} — {len(parties)} parties, {total} blocs, ~{mots} mots\n")
    for partie in parties:
        titres = [b["texte"] for b in partie["blocs"] if b["type"] == "titre"]
        print(f"{partie['titre']} — {len(partie['blocs'])} blocs, {len(titres)} intertitres")
        for t in titres:
            print(f"  · {t}")
        print()
    return 0


if __name__ == "__main__":
    sys.exit(main())
