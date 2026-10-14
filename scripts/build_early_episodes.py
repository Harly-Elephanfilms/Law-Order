#!/usr/bin/env python3
"""Importe le guide Word des saisons 1 à 5, sans compléter les champs vides.

Sur macOS, textutil lit le .doc original. --text accepte une extraction UTF-8
sur les autres plateformes. Le document source n'est jamais modifié.
"""
import argparse
import copy
import json
import re
import shutil
import subprocess
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE_NAME = "Saisons 1 à 5 - Guide des épisodes.doc"
DEST = ROOT / "src/data/early-episodes.json"
SEASON = re.compile(r"^Saison ([1-5])$")
EPISODE = re.compile(r"^Episodes? (\d+)(?:\s*-\s*(\d+))?\s*:\s*(.+)$")
CREDITS = ("Ecrit par", "Écrit par", "Adapt.:", "Adaptation", "Réalisateur")


def paragraphs(text):
    return [re.sub(r"\s+", " ", line).strip() for line in text.splitlines() if line.strip()]


def parse_episode(block, season_number):
    first, last, title = EPISODE.fullmatch(block[0]).groups()
    episode = {"numero": int(first), "titre": title, "credits": [], "notes": []}
    empty_cast = False
    for line in block[1:]:
        if line.startswith("Titre original :"):
            episode["titreVo"] = line.split(":", 1)[1].strip()
        elif line.startswith("Diffusion US :"):
            chain, date = line.split(":", 1)[1].strip().split(",", 1)
            episode["diffusion"] = {"chaine": chain.strip(), "date": date.strip()}
        elif line.startswith(CREDITS):
            episode["credits"].append(line.replace("Ecrit par", "Écrit par", 1))
        elif line == "Avec" or line.startswith("Avec "):
            empty_cast = not line[4:].strip()
            if line[4:].strip():
                episode["casting"] = line[4:].strip()
        elif empty_cast:
            # Les blocs inachevés finissent sur « Avec » vide. La remarque de
            # S5E19 sur le titre homonyme est une note, pas un synopsis.
            episode["notes"].append(line)
        elif "resume" not in episode:
            episode["resume"] = line
        else:
            episode["notes"].append(line.removeprefix("- "))

    if last is None:
        return [episode]

    # Le guide réunit S1E15 et S1E16 dans un bloc unique. Conserver les
    # informations communes comme telles et les dates propres à chaque partie.
    if (season_number, int(first), int(last)) != (1, 15, 16):
        raise ValueError(f"Épisode groupé non pris en charge : {block[0]}")
    titles = re.fullmatch(r"(.+) / (.+), 1e & 2e parties", title)
    vo = re.fullmatch(r"(.+) Part I & II", episode["titreVo"])
    dates = re.fullmatch(r"(\d+) & (\d+) (.+)", episode["diffusion"]["date"])
    if not all((titles, vo, dates)):
        raise ValueError("Le format du double épisode a changé : vérifier la source.")
    result = []
    for index, number in enumerate((15, 16)):
        part = copy.deepcopy(episode)
        part.update(numero=number, titre=titles[index + 1], titreVo=f"{vo[1]} Part {'I' if index == 0 else 'II'}")
        part["diffusion"]["date"] = f"{dates[index + 1]} {dates[3]}"
        part["resume"] = "Résumé commun aux épisodes 15 et 16 : " + part["resume"]
        part["castingLabel"] = "Distribution commune aux épisodes 15 et 16 :"
        result.append(part)
    return result


def parse_guide(text):
    lines = paragraphs(text)
    starts = [i for i, line in enumerate(lines) if SEASON.fullmatch(line)]
    data = {}
    for start, end in zip(starts, starts[1:] + [len(lines)]):
        block = lines[start:end]
        number = int(SEASON.fullmatch(block[0])[1])
        episode_starts = [i for i, line in enumerate(block) if EPISODE.fullmatch(line)]
        cast_start = block.index("GENERIQUE") + 1
        cast_end = block.index("EPISODES")
        starring = []
        notes = []
        for line in block[cast_start:cast_end]:
            match = re.fullmatch(r"([\w.]+(?: [\w.]+){1,3}) : (.+)", line)
            if match and not notes:
                actor, role = match.groups()
                starring.append({"acteur": actor, "role": role})
            else:
                notes.append(line)
        episodes = []
        for ep_start, ep_end in zip(episode_starts, episode_starts[1:] + [len(block)]):
            episodes.extend(parse_episode(block[ep_start:ep_end], number))
        if str(number) in data:
            raise ValueError(f"Saison {number} répétée")
        data[str(number)] = {"starring": starring, "episodes": episodes, "notes": notes}
    validate(data)
    return data


def validate(data):
    if set(data) != {"1", "2", "3", "4", "5"}:
        raise ValueError("Le guide doit contenir les cinq saisons.")
    for number, season in data.items():
        expected = 23 if number == "5" else 22
        if [ep["numero"] for ep in season["episodes"]] != list(range(1, expected + 1)):
            raise ValueError(f"Séquence d'épisodes incomplète pour S{number}")
        if not season["starring"]:
            raise ValueError(f"Distribution absente pour S{number}")
        for ep in season["episodes"]:
            required = ["titre", "titreVo", "diffusion", "credits"]
            if any(not ep.get(field) for field in required):
                raise ValueError(f"Métadonnées manquantes pour S{number}E{ep['numero']}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--text", type=Path, help="Extraction UTF-8 du guide Word")
    args = parser.parse_args()
    if args.text:
        text = args.text.read_text(encoding="utf8")
    else:
        source = next((p for p in ROOT.parent.iterdir() if unicodedata.normalize("NFC", p.name) == SOURCE_NAME), None)
        if not source:
            parser.error(f"Source absente : {SOURCE_NAME}")
        if not shutil.which("textutil"):
            parser.error("textutil est nécessaire sur macOS ; sinon utiliser --text avec une extraction UTF-8.")
        text = subprocess.run(["textutil", "-convert", "txt", "-stdout", str(source)], check=True, capture_output=True).stdout.decode("utf8")
    data = parse_guide(text)
    DEST.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    for number, season in data.items():
        print(f"S{number} : {len(season['episodes'])} épisodes, {len(season['starring'])} rôles principaux")
        missing = [str(e["numero"]) for e in season["episodes"] if not e.get("resume") or not e.get("casting")]
        if missing:
            print(f"  Résumés / distributions invitées absents de la source : {', '.join(missing)}")


if __name__ == "__main__":
    main()
