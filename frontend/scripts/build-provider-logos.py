#!/usr/bin/env python3
"""从 @lobehub/icons-static-svg 生成 public/provider-logos 里的彩色 logo。

用法：python3 scripts/build-provider-logos.py <解包后的 package/icons 目录>

- 有 *-color 变体的品牌：直接用彩色变体（去掉 <title>、宽高和 style）。
- 只有单色标的品牌（OpenAI、xAI、Groq、Ollama、LM Studio）：
  按 Lobe Icons 源码 src/<Brand>/style.ts 里的 Avatar 配色，烘焙成带底色的方块。
"""
import re
import sys
from pathlib import Path

COLOR = [
    "azure", "baiducloud", "bailian", "bedrock", "claude", "deepmind", "deepseek", "doubao",
    "gemini", "hailuo", "hunyuan", "kimi", "kling", "minimax", "mistral", "modelscope",
    "openrouter", "qwen", "siliconcloud", "together", "vidu", "volcengine", "zhipu",
]
# 品牌: (底色, 标志色, 标志占比) —— 取自 lobe-icons src/<Brand>/style.ts 的 AVATAR_* 常量
AVATAR = {
    "openai": ("#000", "#fff", 0.75),
    "xai": ("#fff", "#000", 0.65),
    "groq": ("#F55036", "#fff", 0.75),
    "ollama": ("#fff", "#000", 0.75),
    "lmstudio": ("url(#g)", "#fff", 0.7),
}
GRADIENT = '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6C78EF"/><stop offset="1" stop-color="#4F14BE"/></linearGradient></defs>'


def clean(svg: str) -> str:
    svg = re.sub(r"<title>.*?</title>", "", svg)
    svg = re.sub(r'\s(height|width|style)="[^"]*"', "", svg, count=3)
    return svg.replace("currentColor", "#000")


def inner(svg: str) -> str:
    return re.sub(r"^<svg[^>]*>|</svg>\s*$", "", svg.strip())


def main(src: Path, out: Path) -> None:
    for name in COLOR:
        (out / f"{name}.svg").write_text(clean((src / f"{name}-color.svg").read_text()) + "\n")
    for name, (bg, fg, scale) in AVATAR.items():
        body = inner(clean((src / f"{name}.svg").read_text())).replace('fill="#000"', f'fill="{fg}"')
        offset = round(12 * (1 - scale), 3)
        defs = GRADIENT if bg.startswith("url") else ""
        svg = (
            f'<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">{defs}'
            f'<rect width="24" height="24" rx="5" fill="{bg}"/>'
            f'<g fill="{fg}" fill-rule="evenodd" transform="translate({offset} {offset}) scale({scale})">{body}</g></svg>\n'
        )
        (out / f"{name}.svg").write_text(svg)


if __name__ == "__main__":
    main(Path(sys.argv[1]), Path(__file__).resolve().parent.parent / "public" / "provider-logos")
