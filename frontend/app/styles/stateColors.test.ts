/**
 * 卡片六态色板守护：对比度 + 可区分度（含色盲模拟）。
 * 色值来自 tokens.css，状态映射来自 canvas/nodeStatus.tsx，两边任一改动都会在这里复核。
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { NODE_STATUS } from "~/features/comic-workflow/canvas/nodeStatus";
import type { WorkflowNodeStatus } from "~/features/comic-workflow/graph/types";

type RGB = [number, number, number];
type Theme = "light" | "dark";
const tokensCss = readFileSync(resolve(__dirname, "./tokens.css"), "utf-8");

function token(theme: Theme, name: string): string {
	const split = tokensCss.indexOf('[data-theme="dark"]');
	const source = theme === "light" ? tokensCss.slice(0, split) : tokensCss.slice(split);
	const match = source.match(new RegExp(`${name}:\\s*([^;]+);`));
	if (!match) throw new Error(`tokens.css 缺少 ${name}`);
	return match[1].trim();
}

function color(theme: Theme, name: string): RGB {
	const value = token(theme, name);
	if (value.startsWith("#")) return [1, 3, 5].map((i) => parseInt(value.slice(i, i + 2), 16)) as RGB;
	return value.match(/\d+/g)!.slice(0, 3).map(Number) as RGB;
}

const mix = (fg: RGB, bg: RGB, a: number): RGB => fg.map((c, i) => c * a + bg[i] * (1 - a)) as RGB;
const lin = (v: number) => {
	const c = v / 255;
	return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const unlin = (v: number) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
const luminance = (c: RGB) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
function contrast(a: RGB, b: RGB): number {
	const [x, y] = [luminance(a), luminance(b)];
	return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
function lab(c: RGB): RGB {
	const [r, g, b] = c.map(lin);
	const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
	const x = f((r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047);
	const y = f(r * 0.2126 + g * 0.7152 + b * 0.0722);
	const z = f((r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883);
	return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}
const deltaE = (a: RGB, b: RGB) => {
	const [p, q] = [lab(a), lab(b)];
	return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
};

/** Machado, Oliveira & Fernandes 2009，严重度 1.0（线性 RGB） */
const CVD = {
	protan: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
	deutan: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]],
	tritan: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]],
} as const;
function simulate(c: RGB, m: readonly (readonly number[])[]): RGB {
	const l = c.map(lin);
	return m.map((row) => unlin(Math.min(1, Math.max(0, row[0] * l[0] + row[1] * l[1] + row[2] * l[2])))) as RGB;
}

/** 用户口中的六态 → 卡片状态 */
const SIX: Array<[string, WorkflowNodeStatus]> = [
	["生成中", "generating"],
	["待确认", "review"],
	["审查中", "reviewing"],
	["需重合成", "superseded"],
	["失败", "blocked"],
	["完成", "ready"],
];

function fgOf(theme: Theme, cls: string): RGB {
	const k = cls.match(/text-([a-z-]+?)(?:-fg)?(?:\s|$)/)![1];
	if (k === "ink") return color(theme, "--color-ink");
	if (k === "ink-muted") return color(theme, "--ink-muted");
	return color(theme, `--color-${k}`);
}

function badgeBg(theme: Theme, cls: string, under: RGB): RGB {
	const tinted = cls.match(/bg-([a-z]+)-bg\b/);
	if (tinted) return mix(color(theme, `--color-${tinted[1]}`), under, Number(token(theme, "--status-bg-alpha")));
	const alpha = cls.match(/bg-([a-z]+)\/(\d+)/);
	if (alpha) return mix(color(theme, `--color-${alpha[1]}`), under, Number(alpha[2]) / 100);
	const solid = cls.match(/bg-(paper-\d+|surface)\b/);
	if (solid) return color(theme, `--color-${solid[1]}`);
	throw new Error(`无法解析底色: ${cls}`);
}

describe.each(["light", "dark"] as const)("卡片六态 · %s", (theme) => {
	it.each(SIX)("%s 的文字在自身底色上 ≥ 4.5:1（surface 与 paper-100 上）", (_label, status) => {
		const { cls } = NODE_STATUS[status];
		for (const under of ["--color-surface", "--color-paper-100"]) {
			const bg = badgeBg(theme, cls, color(theme, under));
			expect(contrast(fgOf(theme, cls), bg), `${status} on ${under}`).toBeGreaterThanOrEqual(4.5);
		}
	});

	it("常规色觉下任意两态 ΔE ≥ 20", () => {
		for (let i = 0; i < SIX.length; i++)
			for (let j = i + 1; j < SIX.length; j++) {
				const d = deltaE(fgOf(theme, NODE_STATUS[SIX[i][1]].cls), fgOf(theme, NODE_STATUS[SIX[j][1]].cls));
				expect(d, `${SIX[i][0]} / ${SIX[j][0]}`).toBeGreaterThanOrEqual(20);
			}
	});

	it.each(Object.keys(CVD) as Array<keyof typeof CVD>)("%s 模拟下靠近的两态靠形状区分", (kind) => {
		for (let i = 0; i < SIX.length; i++)
			for (let j = i + 1; j < SIX.length; j++) {
				const [a, b] = [NODE_STATUS[SIX[i][1]], NODE_STATUS[SIX[j][1]]];
				const d = deltaE(simulate(fgOf(theme, a.cls), CVD[kind]), simulate(fgOf(theme, b.cls), CVD[kind]));
				if (d < 12) expect(a.icon, `${SIX[i][0]} / ${SIX[j][0]} ΔE ${d.toFixed(1)}`).not.toBe(b.icon);
			}
	});
});

it("六态的形状互不相同（不靠颜色也能分）", () => {
	const shapes = SIX.map(([, status]) => NODE_STATUS[status].icon ?? `dot:${status}`);
	expect(new Set(shapes).size).toBe(SIX.length);
});
