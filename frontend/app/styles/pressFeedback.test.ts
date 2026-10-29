import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(resolve(__dirname, "globals.css"), "utf8");
const tokens = readFileSync(resolve(__dirname, "tokens.css"), "utf8");

describe("按压反馈", () => {
	it("press 用 motion token，且比按钮缩得更少", () => {
		expect(tokens).toMatch(/--duration-press:\s*120ms/);
		expect(css).toMatch(/\.press:active:not\(:disabled\)\s*{\s*transform:\s*scale\(0\.98\);\s*transition-duration:\s*var\(--duration-press\);/);
		expect(css).toMatch(/\.btn-doodle:active:not\(:disabled\)\s*{[^}]*scale\(0\.97\)/);
	});

	it("减少动画时按钮和卡片都不缩放", () => {
		const block = css.match(/@media \(prefers-reduced-motion: reduce\)\s*{\s*\.btn-doodle:active:not\(:disabled\),\s*\.press:active:not\(:disabled\)\s*{\s*transform:\s*none;/);
		expect(block).not.toBeNull();
	});
});
