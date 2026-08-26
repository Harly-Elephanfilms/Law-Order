#!/usr/bin/env python3
"""Extrait le guide des épisodes des saisons 6 à 10 du livret du coffret.

La source est « LIVRET/Livret_Law_S6a10-96p-hd.pdf », 92 pages. Chaque épisode
y suit la même trame que le guide .odt des saisons 11 à 15, à trois détails
près : le titre est en capitales, le réalisateur a son propre libellé, et le
texte est coupé en lignes de composition — césures comprises.

    Episode 3 - TUEUR DE FLIC
    Titre original : Savages
    Diffusion US : NBC, 18 octobre 1995
    Ecrit par Michael S. Chernuchin, Barry M. Schkolnick
    et Morgan Gendel
    Réalisateur : Jace Alexander
    Avec Maria Tucci, Lynne Thigpen, …, Joe Gonzalez...
    <résumé, terminé par des points de suspension>
    <notes sur les acteurs et la production>

Le résultat est fusionné dans src/data/episodes.json par build_episodes.py.
"""
import json
import re
import sys
from pathlib import Path

from pypdf import PdfReader

SOURCE = Path(
    "/Users/harly/Desktop/LAW & ORDER VOL. 3/LIVRET/Livret_Law_S6a10-96p-hd.pdf"
)
ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / "src/data/booklet.json"

SEASON_HEADING = re.compile(r"^SAISON (10|[6-9])\b.*$")
TITRE_DU_GUIDE = "GUIDE DES ÉPISODES"
NUMERO_DE_PAGE = re.compile(r"^\d{1,3}$")
# En composition étroite, l'étiquette se retrouve seule sur sa ligne.
ETIQUETTE_SEULE = re.compile(r"^(?:(?:Diffusion US|R[ée]alisateur|Titre original)\s*:|R[ée]alis[ée] par)\s*$")
# Certains libellés se retrouvent seuls sur leur ligne, leur complément sur la
# suivante : « Adapté » / « par Robert Palm ». On les reconnaît sur leur début.
CREDIT_PREFIXES = ("Ecrit par", "Écrit par", "Adapté", "Adaptation", "Histoire", "Scénario de")
# « NBC, » se retrouve parfois seul sur sa ligne, sa date sur la suivante.
CHAINE_SEULE = re.compile(r"^[A-Z]{2,4},$")
# Chaque saison s'ouvre sur un générique : « Jerry Orbach : Lennie Briscoe ».
ROLE = re.compile(r"^([A-ZÀ-Ý][\w’'.\- ]+?)\s*:\s*(.+)$")
FIN_DU_GENERIQUE = (
    "Producteur", "Co-producteur", "Musique", "Directeur", "Story editor",
    "Executive story", "SUPPLÉMENTS", "Montage",
)
EPISODE_HEADING = re.compile(r"^Episode\s+(\d+)\s*[-–]\s*(.+)$")
# La diffusion s'écrit « Diffusion US : NBC, 18 octobre 1995 » dans la saison 6,
# puis « NBC, 18 septembre 1996 » à partir de la saison 7. Même chose pour la
# réalisation, tour à tour « Réalisateur : X » et « Réalisé par X ».
DIFFUSION = re.compile(r"^(?:Diffusion US\s*:\s*)?([A-Z]{2,4}),?\s+(\d.+)$")
REALISATION = re.compile(r"^R[ée]alis(?:ateur\s*:\s*|é par\s+)(.+)$")
# Les titres sont composés en capitales : on les repasse en bas de casse, sauf
# les noms propres, que la casse d'origine ne permet pas de distinguer.
NOMS_PROPRES = ("Central Park", "Harlem", "Dieu")
# Un nouveau paragraphe de notes s'ouvre sur un nom de personne — deux mots
# capitalisés — après une phrase achevée.
NOUVELLE_NOTE = re.compile(r"^[A-ZÀ-Ý][\w’'-]+(?: [A-ZÀ-Ý][\w’'.-]+)+")


def read_lines(path):
    """Lignes du livret, césures de composition recollées.

    Le PDF coupe les mots en fin de ligne (« scep -\\ntique »), parfois avec une
    espace avant le tiret. Les recoller est indispensable : sinon un résumé sur
    cinq lignes contient trois mots inventés.
    """
    lines = []
    for page in PdfReader(path).pages:
        for raw in (page.extract_text() or "").split("\n"):
            line = re.sub(r"[ \t]+", " ", raw).strip()
            if line:
                lines.append(line)

    recollees = []
    for line in lines:
        if recollees and re.search(r"\s?-$", recollees[-1]):
            recollees[-1] = re.sub(r"\s?-$", "", recollees[-1]) + line
        elif recollees and (ETIQUETTE_SEULE.match(recollees[-1]) or CHAINE_SEULE.match(recollees[-1])):
            recollees[-1] += " " + line
        else:
            recollees.append(line)
    return recollees


def sans_habillage(lines):
    """Retire l'habillage de page et rattache chaque ligne à sa saison.

    Chaque page du guide s'ouvre sur son numéro puis sur « SAISON N ». Laissés
    en place, ces deux lignes tombent au milieu d'un résumé qui court sur deux
    pages. On les retire, mais on s'en sert au passage pour savoir de quelle
    saison relève ce qui suit.

    L'analyse ne commence qu'au guide : le sommaire du livret énumère lui aussi
    les saisons, et l'introduction les cite à tout bout de champ.
    """
    premier = next(i for i, l in enumerate(lines) if EPISODE_HEADING.match(l))
    depart = max((i for i in range(premier) if lines[i] == TITRE_DU_GUIDE), default=premier)

    saison = None
    utiles = []
    for line in lines[depart + 1 :]:
        if m := SEASON_HEADING.match(line):
            saison = int(m.group(1))
        elif not NUMERO_DE_PAGE.match(line):
            utiles.append((saison, line))

    # Le générique de la saison 6 est composé au-dessus de son titre de section :
    # ces premières lignes n'ont donc pas encore de saison. Elles sont à elle.
    premiere = next((s for s, _ in utiles if s), None)
    return [(s or premiere, line) for s, line in utiles]


def titre_en_casse(titre):
    titre = re.sub(r"\s+\)", ")", titre.strip())
    titre = titre[:1] + titre[1:].lower()
    for nom in NOMS_PROPRES:
        titre = re.sub(nom, nom, titre, flags=re.I)
    return titre


def debut_de_champ(line):
    """Une ligne qui ouvre un nouveau champ, donc ferme le paragraphe courant."""
    return bool(
        EPISODE_HEADING.match(line)
        or DIFFUSION.match(line)
        or REALISATION.match(line)
        or re.match(r"^(Avec |Titre original|Ecrit par|Écrit par)", line)
    )


def bloc(lines, depart):
    """Consomme les lignes jusqu'à celle qui s'achève par des points de suspension.

    Le livret termine ainsi la distribution comme le résumé : c'est la seule
    marque de fin de paragraphe dans un texte sans ligne vide. Quelques
    paragraphes s'achèvent pourtant sur un point — d'où la seconde borne, sans
    laquelle le bloc dévorerait l'épisode suivant.
    """
    morceaux = []
    i = depart
    while i < len(lines):
        if morceaux and debut_de_champ(lines[i]):
            break
        morceaux.append(lines[i])
        if lines[i].endswith("..."):
            i += 1
            break
        i += 1
    return " ".join(morceaux), i


def decouper_notes(lines):
    notes = []
    for line in lines:
        if notes and notes[-1].rstrip().endswith((".", "!", "?")) and NOUVELLE_NOTE.match(line):
            notes.append(line)
        elif notes:
            notes[-1] += " " + line
        else:
            notes.append(line)
    return [re.sub(r"\s+", " ", n).strip() for n in notes if len(n.strip()) > 2]


def parse_generique(lines, depart):
    """Distribution régulière de la saison, en tête de sa section."""
    roles = []
    i = depart
    while i < len(lines) and not EPISODE_HEADING.match(lines[i]):
        if lines[i].startswith(FIN_DU_GENERIQUE):
            break
        if m := ROLE.match(lines[i]):
            acteur, role = m.groups()
            # « Lennie Briscoe - Inspecteur Principal » : on garde la fonction.
            roles.append({"acteur": acteur.strip(), "role": role.replace(" - ", ", ").strip()})
        i += 1
    return roles, i


def separer_credits(credit):
    """« Adapté par X Histoire de Y » → deux crédits distincts."""
    coupes = [m.start() for pref in CREDIT_PREFIXES
              for m in re.finditer(rf"(?<!^)\b{re.escape(pref)}\b", credit)]
    bornes = [0, *sorted(set(coupes)), len(credit)]
    return [credit[a:b].strip() for a, b in zip(bornes, bornes[1:]) if credit[a:b].strip()]


def parse_episode(lines):
    """Un bloc de lignes, titre compris, borné à l'épisode."""
    depart = 0
    numero, titre = EPISODE_HEADING.match(lines[depart]).groups()
    episode = {"numero": int(numero), "titre": titre_en_casse(titre), "credits": [], "notes": []}

    i = depart + 1
    credits_realisateur = None
    while i < len(lines) and not EPISODE_HEADING.match(lines[i]):
        line = lines[i]
        if line.startswith("Titre original"):
            valeur = line.split(":", 1)[1].strip()
            # Le titre original et la diffusion partagent parfois une ligne.
            if m := re.search(r"\s([A-Z]{2,4},?\s+\d.+)$", valeur):
                valeur = valeur[: m.start()].strip()
                if d := DIFFUSION.match(m.group(1)):
                    episode["diffusion"] = {"chaine": d.group(1), "date": d.group(2).strip()}
            episode["titreVo"] = valeur
            i += 1
        elif m := DIFFUSION.match(line):
            episode["diffusion"] = {"chaine": m.group(1), "date": m.group(2).strip()}
            i += 1
        elif line.startswith(CREDIT_PREFIXES):
            # Les scénaristes débordent souvent sur la ligne suivante.
            credit = [line]
            i += 1
            while i < len(lines) and not (
                REALISATION.match(lines[i])
                or DIFFUSION.match(lines[i])
                or lines[i].startswith(("Avec ", "Titre original", "Episode "))
            ):
                credit.append(lines[i])
                i += 1
            episode["credits"] += separer_credits(
                " ".join(credit).replace("Ecrit par", "Écrit par", 1)
            )
        elif m := REALISATION.match(line):
            # Le nom du réalisateur déborde parfois sur la ligne suivante.
            nom = [m.group(1).strip()]
            i += 1
            while i < len(lines) and not debut_de_champ(lines[i]):
                nom.append(lines[i])
                i += 1
            credits_realisateur = "Réalisé par " + " ".join(nom).strip()
        elif line.startswith("Avec ") and "casting" not in episode:
            # Une note peut elle aussi s'ouvrir sur « Avec » — « Avec George
            # DiCenzo, patron irascible de… ». Seule la première occurrence
            # d'un épisode est sa distribution.
            casting, i = bloc(lines, i)
            episode["casting"] = casting[5:].strip()
            if i < len(lines) and not debut_de_champ(lines[i]):
                episode["resume"], i = bloc(lines, i)
        else:
            notes_debut = i
            while i < len(lines) and not EPISODE_HEADING.match(lines[i]):
                i += 1
            episode["notes"] = decouper_notes(lines[notes_debut:i])

    if credits_realisateur:
        episode["credits"].append(credits_realisateur)
    return episode


def main():
    if not SOURCE.exists():
        print(f"Introuvable : {SOURCE}", file=sys.stderr)
        return 1

    annotees = sans_habillage(read_lines(SOURCE))
    lines = [line for _, line in annotees]
    saison_de = [saison for saison, _ in annotees]

    generiques = {}
    for i, line in enumerate(lines):
        if line == "GÉNÉRIQUE" and saison_de[i]:
            generiques[saison_de[i]], _ = parse_generique(lines, i + 1)

    # Chaque épisode s'arrête au suivant — ou au changement de saison, sans quoi
    # son dernier paragraphe absorberait le générique de la saison d'après.
    debuts = [i for i, l in enumerate(lines) if EPISODE_HEADING.match(l) and saison_de[i]]
    saisons = {}
    for rang, debut in enumerate(debuts):
        fin = debuts[rang + 1] if rang + 1 < len(debuts) else len(lines)
        for j in range(debut + 1, fin):
            if saison_de[j] != saison_de[debut]:
                fin = j
                break
        episode = parse_episode(lines[debut:fin])
        saisons.setdefault(saison_de[debut], {}).setdefault(episode["numero"], episode)

    data = {
        str(s): {
            "starring": generiques.get(s, []),
            "episodes": [saisons[s][n] for n in sorted(saisons[s])],
        }
        for s in sorted(saisons)
    }
    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf8")

    print(f"{DEST.relative_to(ROOT)} — {len(data)} saisons\n")
    incomplets = []
    for s, contenu in data.items():
        eps = contenu["episodes"]
        numeros = [e["numero"] for e in eps]
        trous = [n for n in range(1, max(numeros) + 1) if n not in numeros] if eps else []
        print(
            f"S{s:<3} {len(eps):>2} épisodes (1 à {max(numeros) if eps else 0})"
            f"{'' if not trous else f' — manquants : {trous}'} · "
            f"{len(contenu['starring'])} rôles principaux · "
            f"{sum(len(e['notes']) for e in eps)} notes"
        )
        for e in eps:
            absents = [f for f in ("titreVo", "diffusion", "resume", "casting") if not e.get(f)]
            if absents or not e["credits"]:
                incomplets.append(f"S{s}E{e['numero']} : {', '.join(absents or ['credits'])}")

    if incomplets:
        print(f"\n{len(incomplets)} épisode(s) incomplet(s) :")
        for item in incomplets:
            print(f"  - {item}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
