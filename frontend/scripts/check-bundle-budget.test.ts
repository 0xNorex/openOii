import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const script = resolve(__dirname, "check-bundle-budget.mjs");

function dist(jsBytes: Buffer) {
	const dir = mkdtempSync(join(tmpdir(), "budget-"));
	mkdirSync(join(dir, "assets"));
	writeFileSync(join(dir, "assets", "index.js"), jsBytes);
	return dir + "/";
}

describe("check-bundle-budget", () => {
	it("接受指定的构建目录，未超预算时退出 0", () => {
		const res = spawnSync(process.execPath, [script, dist(Buffer.from("console.log(1)"))], { encoding: "utf-8" });
		expect(res.status).toBe(0);
		expect(res.stdout).toMatch(/total \(budget 250/);
	});

	it("单个 chunk 超过 150 KB（gzip）时退出 1", () => {
		const res = spawnSync(process.execPath, [script, dist(randomBytes(160 * 1024))], { encoding: "utf-8" });
		expect(res.status).toBe(1);
		expect(res.stderr).toMatch(/over budget/);
	});
});
