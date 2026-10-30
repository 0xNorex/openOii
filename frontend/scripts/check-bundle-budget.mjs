// Budgets for the build, run after `pnpm build` (optional arg: another outDir):
// - gzip size of the built JS;
// - raw bytes of the self-hosted woff2 fonts, which are all fetched on first load.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const TOTAL_KB = 250;
const CHUNK_KB = 150;
const FONT_KB = 120;
const dist = process.argv[2] ?? new URL("../dist/", import.meta.url).pathname;
const dir = join(dist, "assets");

const chunks = readdirSync(dir)
	.filter((f) => f.endsWith(".js"))
	.map((f) => ({ f, kb: gzipSync(readFileSync(join(dir, f))).length / 1024 }))
	.sort((a, b) => b.kb - a.kb);
const total = chunks.reduce((sum, c) => sum + c.kb, 0);
const over = chunks.filter((c) => c.kb > CHUNK_KB);

const fontDir = join(dist, "fonts");
const fonts = existsSync(fontDir)
	? readdirSync(fontDir)
			.filter((f) => f.endsWith(".woff2"))
			.map((f) => ({ f, kb: statSync(join(fontDir, f)).size / 1024 }))
	: [];
const fontTotal = fonts.reduce((sum, c) => sum + c.kb, 0);

for (const c of chunks.slice(0, 5)) console.log(`${c.kb.toFixed(1).padStart(7)} KB  ${c.f}`);
console.log(`${total.toFixed(1).padStart(7)} KB  total (budget ${TOTAL_KB}, per chunk ${CHUNK_KB})`);
for (const c of fonts) console.log(`${c.kb.toFixed(1).padStart(7)} KB  fonts/${c.f}`);
console.log(`${fontTotal.toFixed(1).padStart(7)} KB  fonts (budget ${FONT_KB})`);

if (total > TOTAL_KB || over.length > 0 || fontTotal > FONT_KB) {
	for (const c of over) console.error(`over budget: ${c.f} ${c.kb.toFixed(1)} KB`);
	if (total > TOTAL_KB) console.error(`over budget: total ${total.toFixed(1)} KB`);
	if (fontTotal > FONT_KB) console.error(`over budget: fonts ${fontTotal.toFixed(1)} KB`);
	process.exit(1);
}
