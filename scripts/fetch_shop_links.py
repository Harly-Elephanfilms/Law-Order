#!/usr/bin/env python3
"""Relève les liens d'achat Elephant Films depuis la page catégorie Law & Order.

Les identifiants produit (…-c2x41019018) sont opaques et changent à chaque
nouvelle référence : on ne les écrit pas à la main, on les relit à la source.
À relancer à chaque sortie de coffret.
"""
import json
import re
import subprocess
import sys
from pathlib import Path

CATEGORY = "https://www.elephantfilms.com/law-order-c102x4367847"
ROOT = Path(__file__).resolve().parent.parent
DEST = ROOT / "src/data/shop-links.json"


def fetch(url):
    # curl plutôt qu'urllib : le Python de pyenv n'a pas de magasin de
    # certificats utilisable, et la boutique est en ISO-8859-1.
    out = subprocess.run(
        ["curl", "-sSLf", "--max-time", "60", "-A", "Mozilla/5.0", url],
        capture_output=True, check=True,
    ).stdout
    return out.decode("iso-8859-1", errors="replace")


def main():
    html = fetch(CATEGORY)
    links = sorted(set(re.findall(r'href="((?:law-order[^"]*?)c2x4\d+)"', html)))
    if not links:
        print("Aucun lien trouvé : la page catégorie a changé de structure.", file=sys.stderr)
        return 1

    seasons, integrales = {}, {}
    for slug in links:
        url = f"https://www.elephantfilms.com/{slug}"
        support = "bluray" if "blu-ray" in slug else "dvd"
        if m := re.search(r"integrale-saison-(\d+)-", slug):
            seasons.setdefault(m.group(1), {})[support] = url
        elif m := re.search(r"integrale-saisons-(\d+)-a-(\d+)", slug):
            integrales.setdefault(f"{m.group(1)}-{m.group(2)}", {})[support] = url

    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text(
        json.dumps({"seasons": seasons, "integrales": integrales}, ensure_ascii=False, indent=2),
        encoding="utf8",
    )

    missing = [
        f"S{n} {sup}"
        for n in range(1, 16)
        for sup in ("dvd", "bluray")
        if sup not in seasons.get(str(n), {})
    ]
    print(f"{DEST.relative_to(ROOT)} — {len(seasons)} saisons, {len(integrales)} intégrales")
    print("Manquants :", ", ".join(missing) if missing else "aucun")
    return 0


if __name__ == "__main__":
    sys.exit(main())
