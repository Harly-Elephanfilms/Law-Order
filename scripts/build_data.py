#!/usr/bin/env python3
"""Construit src/data/seasons.json à partir des dossiers sources Elephant Films.

Trois sources, par ordre de confiance :
  1. les fiches FIP (.xlsx)  — résumé, accroche, bonus, technique, EAN ;
  2. les jaquettes (.pdf)    — même contenu, pour les saisons sans FIP ;
  3. les noms de fichiers    — EAN (13 chiffres) et packshots 3D.

Le texte éditorial que ces sources ne couvrent pas est complété à la main dans
src/data/seasons.overrides.json, qui a le dernier mot.
"""
import json
import re
import sys
from pathlib import Path

import openpyxl
from pypdf import PdfReader

SOURCE = Path("/Users/harly/Desktop/LAW & ORDER VOL. 3")
ROOT = Path(__file__).resolve().parent.parent
IMG_EXT = {".png", ".jpg", ".jpeg", ".tif", ".webp"}

FIP_LABELS = {
    "accroche": "accroche",
    "résumé": "resume",
    "resume": "resume",
    "accroche secondaire": "accroche_secondaire",
    "suppléments": "supplements",
    "supplements": "supplements",
    "caractéristiques techniques": "technique",
    "caracteristiques techniques": "technique",
    "code barre": "ean",
}
FIP_BOUNDARIES = set(FIP_LABELS) | {
    "recto", "verso", "tranche", "rondelles", "titre", "logos", "en bas",
    "sous-titre", "référence", "reference", "mentions légales", "mentions legales",
    "visuel", "textes", "mention", "fiche infos packaging",
}


def norm(value):
    return re.sub(r"\s+", " ", str(value)).strip()


def clean_item(value):
    """Nettoie un intitulé de bonus : espaces, puces, et numéros de page.

    Les jaquettes portent en pied le numéro de saison et le nombre de disques,
    que l'extraction PDF ramasse à la suite du dernier bonus.
    """
    item = re.sub(r"\s+", " ", value).strip(" .•*-")
    item = re.sub(r"(?:\s+\d{1,2})+$", "", item)
    return item if len(item) > 2 else ""


def support_of(path):
    """dvd ou bluray, d'après le nom de fichier puis le dossier.

    Les noms de fichiers sources sont irréguliers : « Law_S6-DVD-3D.png »,
    « FIP BRD S5 Law and order DEF.xlsx », « Law_S6-JaqDVD-hd.pdf ».
    """
    name = path.name.upper()
    if re.search(r"\bBD\b|\bBRD\b|BLU-?RAY|JAQBD|ETUIBD", name):
        return "bluray"
    if re.search(r"\bDVD\b|JAQDVD|ETUIDVD", name):
        return "dvd"
    parts = [p.upper() for p in path.parts]
    if any(p in ("BLU-RAY", "BLU RAY", "BRD", "BD") for p in parts):
        return "bluray"
    if any(p == "DVD" for p in parts):
        return "dvd"
    return None


def parse_fip(path):
    """Champs d'une fiche FIP, plus le support qu'elle décrit si détectable."""
    ws = openpyxl.load_workbook(path, data_only=True).worksheets[0]
    lines = []
    for row in ws.iter_rows(values_only=True):
        cells = [norm(c) for c in row if c not in (None, "")]
        if cells:
            lines.append(cells)

    out, key, buf = {}, None, []

    def flush():
        if not (key and buf):
            return
        if key == "technique":
            out.setdefault(key, "\n".join(buf))
        elif key == "supplements":
            items = []
            for line in buf:
                items += re.split(r"\s+\*\s+", line)
            out.setdefault(key, [i for i in map(clean_item, items) if i])
        else:
            out.setdefault(key, " ".join(buf))

    for cells in lines:
        label = cells[0].lower().rstrip(" :")
        if label in FIP_BOUNDARIES:
            flush()
            key, buf = FIP_LABELS.get(label), []
            if key and len(cells) > 1:
                buf.extend(cells[1:])
        elif key:
            buf.append(" ".join(cells))
    flush()
    if "ean" in out and (m := re.search(r"\b(3\d{12})\b", out["ean"])):
        out["ean"] = m.group(1)

    blob = "\n".join(" ".join(c) for c in lines)
    if m := re.search(r"(\d{1,2})\s*(?:x\s*\d+\s*min|[ée]pisodes)", blob, re.I):
        out["episodes"] = int(m.group(1))
    if "ean" not in out and (m := re.search(r"\b(3\d{12})\b", blob)):
        out["ean"] = m.group(1)
    # Certaines FIP ne portent le support que dans leur contenu.
    if re.search(r"\bBlu-?ray\b", blob, re.I):
        out["_support"] = "bluray"
    elif re.search(r"\bDVD\b", blob):
        out["_support"] = "dvd"
    return out


def parse_jaquette(path):
    """Verso de jaquette : sert de source pour les éditions sans fiche FIP.

    Le pied de page est régulier — « 6 DVD » ou « 5 BLU-RAY », les
    caractéristiques en puces, puis « SUPPLÉMENTS » et les bonus en puces —
    ce qui permet d'en tirer les deux blocs sans les ressaisir.
    """
    text = PdfReader(path).pages[0].extract_text() or ""
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{2,}", "\n", text).strip()

    out = {"jaquette_text": text}
    if m := re.search(r"(\d{1,2})\s*[ÉE]PISODES", text, re.I):
        out["episodes"] = int(m.group(1))
    if m := re.search(r"\b(3\d{12})\b", text):
        out["ean"] = m.group(1)

    if m := re.search(r"^\s*(\d{1,2}\s+(?:DVD|BLU-?RAY))\s*$", text, re.I | re.M):
        technique, _, supplements = text[m.end():].partition("SUPPLÉMENTS")

        def bullets(block):
            # Les mentions légales et l'URL suivent parfois les puces, parfois
            # s'intercalent entre les deux blocs : on coupe dans chacun.
            block = re.split(r"EDV\s|www\.lawandorder|Avec le soutien|RÉF\.", block)[0]
            return [i for i in (clean_item(b) for b in block.split("•")) if i]

        if items := bullets(technique):
            out["technique"] = "\n".join([m.group(1).upper().replace("BLU-RAY", "Blu-ray")] + items)
        if items := bullets(supplements):
            out["supplements"] = items
    return out


def collect(season):
    """Inventorie une saison : packshots, photos, EAN, et champs FIP/jaquette."""
    base = SOURCE / f"SAISON {season}"
    supports = {"dvd": {}, "bluray": {}}
    photos = []
    orphan_eans = []

    for path in sorted(base.rglob("*")):
        if not path.is_file() or path.name.startswith("."):
            continue
        rel = path.relative_to(SOURCE)
        ext = path.suffix.lower()
        sup = support_of(path)
        upper_parts = [p.upper() for p in path.parts]

        if ext == ".xlsx" and not path.name.startswith("~$"):
            fields = parse_fip(path)
            sup = sup or fields.pop("_support", None)
            fields.pop("_support", None)
            if sup:
                supports[sup].update(fields)
                supports[sup]["source_fip"] = str(rel)
        elif ext == ".pdf" and re.search(r"JAQ", path.name, re.I):
            if sup and "jaquette_text" not in supports[sup]:
                for field, value in parse_jaquette(path).items():
                    supports[sup].setdefault(field, value)
                supports[sup]["source_jaquette"] = str(rel)
        elif ext in IMG_EXT:
            if any("PHOTOS" in p or p == "PNG" for p in upper_parts):
                photos.append(str(rel))
            elif re.search(r"-Dos\b", path.name, re.I):
                # Dos de jaquette : l'accroche, le résumé, les caractéristiques
                # et le code-barres tels qu'ils sont imprimés sur le boîtier.
                if sup:
                    supports[sup].setdefault("dos", str(rel))
            elif "3D" in path.name.upper() or any("PACKSHOT" in p for p in upper_parts):
                if not sup:
                    # Dossier PACKSHOTS commun aux deux supports (saisons 1 à 5) :
                    # les fichiers nommés par EAN ne disent pas lequel.
                    if re.fullmatch(r"3\d{12}", path.stem):
                        orphan_eans.append(path.stem)
                    continue
                stem = path.stem
                if re.fullmatch(r"3\d{12}", stem):
                    supports[sup].setdefault("ean_fichier", stem)
                # Le packshot détouré est toujours un PNG, mais son nom varie :
                # « Law_S6-BD-3D.png » pour les premières saisons, l'EAN seul
                # pour les suivantes. Les JPG du même dossier sont aplatis sur
                # blanc et ne servent que de repli.
                current = supports[sup].get("packshot")
                if ext == ".png":
                    if current is None or not current.endswith(".png"):
                        supports[sup]["packshot"] = str(rel)
                elif current is None and "3D" in stem.upper():
                    supports[sup]["packshot"] = str(rel)

    for sup in supports.values():
        sup.setdefault("ean", sup.get("ean_fichier"))
        sup.pop("ean_fichier", None)

    # Deux EAN dans un dossier commun, un seul support identifié par sa FIP :
    # le second EAN est celui de l'autre support.
    known = {s["ean"] for s in supports.values() if s.get("ean")}
    remaining = [e for e in dict.fromkeys(orphan_eans) if e not in known]
    if len(remaining) == 1:
        for sup in supports.values():
            if sup and not sup.get("ean"):
                sup["ean"] = remaining[0]
                break

    # Le texte éditorial (accroches, résumé) décrit la saison, pas le support :
    # une seule FIP suffit à le fournir pour le DVD et le Blu-ray. L'EAN, le
    # packshot, les caractéristiques techniques et les bonus, eux, diffèrent
    # d'une édition à l'autre et restent attachés au support.
    editorial = {}
    conflicts = []
    for field in ("accroche", "resume", "accroche_secondaire", "episodes"):
        values = {sup: supports[sup].get(field) for sup in ("bluray", "dvd")}
        if field == "episodes" and all(values.values()) and len(set(values.values())) > 1:
            conflicts.append(f"episodes : Blu-ray={values['bluray']}, DVD={values['dvd']}")
        for sup in ("bluray", "dvd"):
            if values[sup]:
                editorial.setdefault(field, values[sup])
        for sup in supports.values():
            sup.pop(field, None)

    # La saison 1 est diffusée en 1990-1991, la saison n en (1989+n)-(1990+n).
    return {
        "number": season,
        "years": f"{1989 + season}-{1990 + season}",
        "conflicts": conflicts,
        **editorial,
        "supports": {k: v for k, v in supports.items() if v},
        "photos": photos,
    }


def main():
    links_path = ROOT / "src/data/shop-links.json"
    if not links_path.exists():
        print("src/data/shop-links.json absent : lancez d'abord scripts/fetch_shop_links.py",
              file=sys.stderr)
        return 1
    shop = json.loads(links_path.read_text(encoding="utf8"))["seasons"]

    overrides_path = ROOT / "src/data/seasons.overrides.json"
    overrides = json.loads(overrides_path.read_text(encoding="utf8")) if overrides_path.exists() else {}

    seasons = []
    for n in range(1, 16):
        data = collect(n)
        for sup, url in shop.get(str(n), {}).items():
            data["supports"].setdefault(sup, {})["url"] = url
        for key, value in overrides.get(str(n), {}).items():
            if key == "supports":
                for sup, fields in value.items():
                    data["supports"].setdefault(sup, {}).update(fields)
            else:
                data[key] = value
        seasons.append(data)

    dest = ROOT / "src/data/seasons.json"
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(json.dumps(seasons, ensure_ascii=False, indent=2), encoding="utf8")

    print(f"{dest.relative_to(ROOT)} — {len(seasons)} saisons\n")
    print(f"{'':4} {'DVD':<20} {'BLU-RAY':<20} {'éditorial':<12} eps  photos")
    for s in seasons:
        cells = []
        for sup in ("dvd", "bluray"):
            d = s["supports"].get(sup, {})
            flags = "".join([
                "P" if d.get("packshot") else "-",
                "D" if d.get("dos") else "-",
                "T" if d.get("technique") else "-",
                "B" if d.get("supplements") else "-",
                "L" if d.get("url") else "-",
            ])
            cells.append(f"{flags} {d.get('ean') or '?':<13}")
        edito = "".join([
            "A" if s.get("accroche_secondaire") else "-",
            "R" if s.get("resume") else "-",
        ])
        print(f"S{s['number']:<3} {cells[0]:<20} {cells[1]:<20} {edito:<12} "
              f"{s.get('episodes') or '?':<4} {len(s['photos'])}")
    print("\nP=packshot D=dos T=technique B=bonus L=lien boutique | A=accroche R=résumé")

    # Les bonus sont absents de plusieurs coffrets (saisons 11 à 14) : c'est le
    # contenu réel du packaging, pas un trou de données. On ne signale que ce
    # qui empêcherait une fiche d'être complète.
    gaps = []
    for s in seasons:
        for name, sup in s["supports"].items():
            for field in ("packshot", "dos", "ean", "url", "technique"):
                if not sup.get(field):
                    gaps.append(f"S{s['number']} {name}: {field}")
        for field in ("resume", "accroche_secondaire", "episodes"):
            if not s.get(field):
                gaps.append(f"S{s['number']}: {field}")
    if gaps:
        print(f"\n{len(gaps)} champ(s) manquant(s) :")
        for g in gaps:
            print(f"  - {g}")

    # Les deux fiches d'une même saison se contredisent parfois : on le dit
    # plutôt que de retenir silencieusement la première lue.
    conflicts = []
    for s in seasons:
        for c in s.get("conflicts", []):
            field = c.split(" :")[0]
            settled = field in overrides.get(str(s["number"]), {})
            conflicts.append(
                f"S{s['number']} — {c}"
                + (" → tranché dans seasons.overrides.json" if settled else " → NON TRANCHÉ")
            )
    if conflicts:
        print(f"\n{len(conflicts)} désaccord(s) entre sources :")
        for c in conflicts:
            print(f"  - {c}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
