// Gzip budget for the built JS: run after `pnpm build`.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const TOTAL_KB = 250;
const CHUNK_KB = 150;
const dir = new URL("../dist/assets/", import.meta.url).pathname;

const chunks = readdirSync(dir)
	.filter((f) => f.endsWith(".js"))
	.map((f) => ({ f, kb: gzipSync(readFileSync(join(dir, f))).length / 1024 }))
	.sort((a, b) => b.kb - a.kb);
const total = chunks.reduce((sum, c) => sum + c.kb, 0);
const over = chunks.filter((c) => c.kb > CHUNK_KB);

for (const c of chunks.slice(0, 5)) console.log(`${c.kb.toFixed(1).padStart(7)} KB  ${c.f}`);
console.log(`${total.toFixed(1).padStart(7)} KB  total (budget ${TOTAL_KB}, per chunk ${CHUNK_KB})`);

if (total > TOTAL_KB || over.length > 0) {
	for (const c of over) console.error(`over budget: ${c.f} ${c.kb.toFixed(1)} KB`);
	if (total > TOTAL_KB) console.error(`over budget: total ${total.toFixed(1)} KB`);
	process.exit(1);
}
