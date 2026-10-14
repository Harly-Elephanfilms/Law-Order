#!/usr/bin/env python3
"""Extrait le guide des épisodes des saisons 11 à 15 vers src/data/episodes.json.

La source est le document de travail « Saisons 11 à 15 - Guide des épisodes.odt ».
Chaque épisode y suit la même trame :

    Episode 8 : Le Paradis perdu
    Titre original : The Fire This Time
    NBC, 21 novembre 2001
    Ecrit par David Black
    Réalisé par David Platt
    <résumé>
    Avec <distribution de l'épisode>
    <notes libres sur les acteurs, la production…>
"""
import html
import json
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT.parent / "Saisons 11 à 15 - Guide des épisodes.odt"
DEST = ROOT / "src/data/episodes.json"

CREDIT_PREFIXES = ("Ecrit par", "Écrit par", "Adapté par", "Histoire de", "Scénario de", "Réalisé par")
SEASON_HEADING = re.compile(r"^Saison (\d+) \((\d{4}-\d{4})\)")
EPISODE_HEADING = re.compile(r"^Episode\s+(\d+)\s*:\s*(.+)")
# Le document accole le rôle au nom : « Jerry Orbach(Detective Lennie Briscoe) ».
STARRING = re.compile(r"^(.+?)\s*\((.+)\)$")


def read_paragraphs(path):
    """Paragraphes du document, espaces `<text:s/>` restituées.

    L'ODF encode en `<text:s/>` les espaces qui bordent un changement de style
    — ici les titres en italique. Les supprimer avec les balises collerait les
    mots (« dansLa famille des collines »).
    """
    xml = zipfile.ZipFile(path).read("content.xml").decode("utf8")
    xml = re.sub(r"<text:(s|tab)\b[^>]*/>", " ", xml)
    xml = re.sub(r"</text:(p|h)>", "\n", xml)
    xml = re.sub(r"<[^>]+>", "", xml)

    lines = (html.unescape(line) for line in xml.split("\n"))
    return [re.sub(r"[ \t]+", " ", line).strip() for line in lines if line.strip()]


def parse_episode(block):
    """Un bloc de paragraphes (titre inclus) → un épisode."""
    number, title = EPISODE_HEADING.match(block[0]).groups()
    episode = {
        "numero": int(number),
        "titre": title.strip(),
        "credits": [],
        "notes": [],
    }

    crossover = False
    for line in block[1:]:
        # Le guide ajoute le crossover après S15E20. Ses métadonnées doivent
        # rester dans les notes, sans remplacer celles de Tombstone.
        if line.startswith("NEW YORK COUR DE JUSTICE Episode"):
            crossover = True
        if crossover:
            episode["notes"].append(line)
            continue
        if line.startswith("Titre original"):
            episode["titreVo"] = line.split(":", 1)[1].strip()
        elif re.match(r"^[A-Z]{2,4}, ", line):  # « NBC, 21 novembre 2001 »
            chain, _, date = line.partition(", ")
            episode["diffusion"] = {"chaine": chain, "date": date.strip()}
        elif line.startswith(CREDIT_PREFIXES):
            # Le document écrit « Ecrit par » sans accent.
            episode["credits"].append(line.replace("Ecrit par", "Écrit par", 1))
        elif line.startswith("Avec "):
            episode["casting"] = line[5:].strip()
        elif "resume" not in episode:
            episode["resume"] = line
        else:
            episode["notes"].append(line)

    return episode


def parse_season(block):
    """Un bloc de saison → distribution principale et épisodes."""
    number, years = SEASON_HEADING.match(block[0]).groups()

    starts = [i for i, line in enumerate(block) if EPISODE_HEADING.match(line)]
    starring = []
    if starts:
        for line in block[1 : starts[0]]:
            if line == "Starring":
                continue
            if line.startswith(("Producteur", "Co-producteur", "Créateur", "Créé par", "Musique")):
                break  # Les parenthèses de crédits techniques ne sont pas des rôles.
            if match := STARRING.match(line):
                name, role = match.groups()
                starring.append({"acteur": name.strip(), "role": role.strip()})
            else:
                break  # les lignes suivantes sont l'équipe technique

    episodes = [
        parse_episode(block[start:end])
        for start, end in zip(starts, starts[1:] + [len(block)])
    ]
    return {"number": int(number), "years": years, "starring": starring, "episodes": episodes}


def main():
    if not SOURCE.exists():
        print(f"Introuvable : {SOURCE}", file=sys.stderr)
        return 1

    lines = read_paragraphs(SOURCE)
    starts = [i for i, line in enumerate(lines) if SEASON_HEADING.match(line)]
    seasons = [
        parse_season(lines[start:end])
        for start, end in zip(starts, starts[1:] + [len(lines)])
    ]

    data = {str(s["number"]): {"starring": s["starring"], "episodes": s["episodes"]} for s in seasons}
    # Coquille présente dans le document de travail, conservé intact.
    for episode in data.get("14", {}).get("episodes", []):
        if episode["numero"] == 12 and episode.get("resume"):
            episode["resume"] = episode["resume"].replace("priso, Mayor of Kingstownn", "prison")
    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf8")

    print(f"{DEST.relative_to(ROOT)} — {len(seasons)} saisons\n")
    incomplete = []
    for season in seasons:
        eps = season["episodes"]
        print(
            f"S{season['number']:<3} {len(eps):>2} épisodes · "
            f"{len(season['starring'])} rôles principaux · "
            f"{sum(len(e['notes']) for e in eps)} notes"
        )
        for e in eps:
            missing = [f for f in ("titreVo", "diffusion", "resume", "casting") if not e.get(f)]
            if missing or not e["credits"]:
                incomplete.append(f"S{season['number']}E{e['numero']} : {', '.join(missing or ['credits'])}")

    if incomplete:
        print(f"\n{len(incomplete)} épisode(s) incomplet(s) :")
        for item in incomplete:
            print(f"  - {item}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
