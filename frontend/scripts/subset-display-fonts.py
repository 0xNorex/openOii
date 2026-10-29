#!/usr/bin/env python3
"""Rebuild the display (heading) font. Needs: pip install fonttools brotli

  python3 scripts/subset-display-fonts.py [--src DIR]

Smiley Sans 得意黑 v2.0.1 (SIL OFL 1.1, © atelierAnchor), Chinese + Latin from one family:
subset to public/fonts/display-cjk.chars.txt + Basic Latin → public/fonts/oii-display.woff2

The licence reserves the font names "Smiley" and "得意黑", and a subset is a Modified Version,
so the subset is renamed to "openOii Display" (name table, file name and CSS family) —
OFL §3. The original licence ships next to it as public/fonts/OFL-SmileySans.txt.
Source: https://github.com/atelier-anchor/smiley-sans/releases/tag/v2.0.1
"""
import argparse, io, os, urllib.request, zipfile
from fontTools import subset
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, "..", "public", "fonts")
ZIP = "https://github.com/atelier-anchor/smiley-sans/releases/download/v2.0.1/smiley-sans-v2.0.1.zip"
TTF = "SmileySans-Oblique.ttf"
FAMILY = "openOii Display"
LATIN = "".join(chr(c) for c in range(0x20, 0x7F)) + "\u2018\u2019\u201c\u201d\u2013\u2014\u2026\u00b7"


def fetch(src_dir):
    path = os.path.join(src_dir, TTF)
    if not os.path.exists(path):
        data = urllib.request.urlopen(ZIP).read()
        with zipfile.ZipFile(io.BytesIO(data)) as zf:
            name = next(n for n in zf.namelist() if n.endswith(TTF))
            with open(path, "wb") as out:
                out.write(zf.read(name))
    return path


def rename(font):
    """OFL Reserved Font Name: the modified (subset) font must not use "Smiley" / "得意黑"."""
    names = {1: FAMILY, 2: "Regular", 3: f"{FAMILY} Regular 2.0.1 subset",
             4: f"{FAMILY} Regular", 6: FAMILY.replace(" ", "-") + "-Regular", 16: FAMILY, 17: "Regular"}
    table = font["name"]
    for record in list(table.names):
        if record.nameID in names or record.nameID in (18, 21, 22):
            table.removeNames(nameID=record.nameID)
    for name_id, value in names.items():
        table.setName(value, name_id, 3, 1, 0x409)
    for record in table.names:
        text = record.toUnicode()
        assert "Smiley" not in text and "得意黑" not in text or record.nameID in (0, 13), (record.nameID, text)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="/tmp/display-font-src")
    args = ap.parse_args()
    os.makedirs(args.src, exist_ok=True)

    chars = "".join(open(os.path.join(FONTS, "display-cjk.chars.txt"), encoding="utf8").read().split())
    font = TTFont(fetch(args.src))
    missing = [c for c in chars + LATIN if ord(c) not in font.getBestCmap()]
    if missing:
        raise SystemExit(f"Smiley Sans has no glyph for: {''.join(missing)}")

    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["kern", "liga", "calt", "lnum", "tnum", "halt", "vert"]
    opts.name_IDs = ["*"]
    sub = subset.Subsetter(opts)
    sub.populate(text=chars + LATIN)
    sub.subset(font)
    rename(font)
    font.flavor = "woff2"
    out = os.path.join(FONTS, "oii-display.woff2")
    font.save(out)
    print(f"{os.path.relpath(out)}: {os.path.getsize(out) / 1024:.1f} KB")


if __name__ == "__main__":
    main()
