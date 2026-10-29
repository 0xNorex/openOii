/** 双色板和语义对比度守护，色值由 tokens.css 独立提供。 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const tokensCss = readFileSync(resolve(__dirname, "./tokens.css"), "utf-8");
type Theme = "root" | "dark";

function tokenValue(theme: Theme, name: string): string {
  const split = tokensCss.indexOf('[data-theme="dark"]');
  const source = theme === "root" ? tokensCss.slice(0, split) : tokensCss.slice(split);
  const match = source.match(new RegExp(`${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`tokens.css 缺少 ${name}`);
  return match[1].trim();
}

function tokenColor(theme: Theme, name: string): [number, number, number] {
  const value = tokenValue(theme, name);
  if (value.startsWith("#")) {
    const hex = value.slice(1);
    return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)) as [number, number, number];
  }
  const channels = value.match(/\d+/g)?.map(Number);
  if (!channels || channels.length !== 3) throw new Error(`无效颜色令牌 ${name}: ${value}`);
  return channels as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]): number {
  const linear = (value: number) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
}

function contrast(foreground: [number, number, number], background: [number, number, number]): number {
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

/** 颜色令牌：hex 或 "r g b"；带 alpha 的 rgb(var(--color-ink) / a) 合成到给定底色上。 */
function textColor(theme: Theme, name: string, background: [number, number, number]): [number, number, number] {
  const value = tokenValue(theme, name);
  const alpha = value.match(/rgb\(var\(--color-ink\)\s*\/\s*([\d.]+)\)/);
  if (!alpha) return tokenColor(theme, name);
  const ink = tokenColor(theme, "--color-ink");
  const a = Number(alpha[1]);
  return ink.map((channel, index) => channel * a + background[index] * (1 - a)) as [number, number, number];
}

const FILLS = ["primary", "neutral", "info", "success", "warning", "error"] as const;
const STATUS = ["info", "success", "warning", "error"] as const;
/** bg、sunken、border（偶尔作底）、surface */
const SURFACES = ["--color-paper-100", "--color-paper-200", "--color-paper-300", "--color-surface"] as const;
const THEMES = [["light", "root"], ["dark", "dark"]] as const;

describe.each(THEMES)("主题 %s", (_name, theme) => {
  const on = (fg: string, surface: string) =>
    contrast(textColor(theme, fg, tokenColor(theme, surface)), tokenColor(theme, surface));

  it.each(FILLS)("%s 填充上的文字色 ≥ 4.5:1", (key) => {
    expect(contrast(tokenColor(theme, `--color-${key}-content`), tokenColor(theme, `--color-${key}`))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(SURFACES)("ink 在 %s 上 ≥ 7:1", (surface) => {
    expect(on("--color-ink", surface)).toBeGreaterThanOrEqual(7);
  });

  it.each(SURFACES)("ink-muted 在 %s 上 ≥ 4.5:1", (surface) => {
    expect(on("--ink-muted", surface)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(SURFACES)("ink-subtle 在 %s 上 ≥ 3:1", (surface) => {
    expect(on("--ink-subtle", surface)).toBeGreaterThanOrEqual(3);
  });

  it.each(["--color-primary-hover", "--color-primary-pressed"])("primary-content 在 %s 上 ≥ 4.5:1", (fill) => {
    expect(contrast(tokenColor(theme, "--color-primary-content"), tokenColor(theme, fill))).toBeGreaterThanOrEqual(4.5);
  });

  it.each(["--color-paper-100", "--color-paper-200", "--color-surface"])("primary 作文字在 %s 上 ≥ 4.5:1", (surface) => {
    expect(on("--color-primary", surface)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(STATUS.flatMap((key) => ["--color-paper-100", "--color-paper-200", "--color-surface"].map((surface) => [key, surface])))(
    "%s-fg 在 %s 上 ≥ 4.5:1",
    (key, surface) => {
      expect(on(`--color-${key}`, surface)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it.each(["--color-paper-100", "--color-surface"])("border-strong 在 %s 上 ≥ 3:1（WCAG 1.4.11）", (surface) => {
    expect(on("--color-border-strong", surface)).toBeGreaterThanOrEqual(3);
  });
});
