#!/usr/bin/env python3
"""Rebuild the display (heading) fonts. Needs: pip install fonttools brotli

  python3 scripts/subset-display-fonts.py [--src DIR]

- Unbounded (SIL OFL 1.1): instanced at wght=700, Latin subset → public/fonts/unbounded-700.woff2
- ZCOOL QingKe HuangYou 站酷庆科黄油体 (SIL OFL 1.1): subset to public/fonts/display-cjk.chars.txt
  → public/fonts/zcool-qingke-huangyou-display.woff2
Neither licence declares a Reserved Font Name, so the subsets keep their family names.
Sources: https://github.com/google/fonts/tree/main/ofl/{unbounded,zcoolqingkehuangyou}
"""
import argparse, os, urllib.request
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = os.path.join(HERE, "..", "public", "fonts")
RAW = "https://github.com/google/fonts/raw/main/ofl/"
SRC = {
    "unbounded": RAW + "unbounded/Unbounded%5Bwght%5D.ttf",
    "huangyou": RAW + "zcoolqingkehuangyou/ZCOOLQingKeHuangYou-Regular.ttf",
}
LATIN = "".join(chr(c) for c in range(0x20, 0x7F)) + "\u2018\u2019\u201c\u201d\u2013\u2014\u2026\u00b7"


def fetch(key, src_dir):
    path = os.path.join(src_dir, os.path.basename(SRC[key]).replace("%5B", "[").replace("%5D", "]"))
    if not os.path.exists(path):
        urllib.request.urlretrieve(SRC[key], path)
    return path


def build(font, out, text):
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["kern", "liga", "calt", "lnum", "tnum"]
    sub = subset.Subsetter(opts)
    sub.populate(text=text)
    sub.subset(font)
    font.flavor = "woff2"
    font.save(out)
    print(f"{os.path.relpath(out)}: {os.path.getsize(out) / 1024:.1f} KB")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", default="/tmp/display-font-src")
    args = ap.parse_args()
    os.makedirs(args.src, exist_ok=True)

    unbounded = instancer.instantiateVariableFont(TTFont(fetch("unbounded", args.src)), {"wght": 700})
    build(unbounded, os.path.join(FONTS, "unbounded-700.woff2"), LATIN)

    chars = "".join(open(os.path.join(FONTS, "display-cjk.chars.txt"), encoding="utf8").read().split())
    huangyou = TTFont(fetch("huangyou", args.src))
    missing = [c for c in chars if ord(c) not in huangyou.getBestCmap()]
    if missing:
        raise SystemExit(f"ZCOOL QingKe HuangYou has no glyph for: {''.join(missing)}")
    build(huangyou, os.path.join(FONTS, "zcool-qingke-huangyou-display.woff2"), chars)


if __name__ == "__main__":
    main()
