import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { globSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * 标题字体（庆科黄油体）只打包了固定标题用到的字。这里把源码里所有会用 .display 渲染的
 * 固定文案找出来，逐字比对子集清单；缺字会在标题中间掉回系统字体，所以直接让测试失败。
 * 补字：把字加进 public/fonts/display-cjk.chars.txt，再跑 scripts/subset-display-fonts.py。
 */
const root = resolve(__dirname, "../..");
const CHARS = new Set(readFileSync(resolve(root, "public/fonts/display-cjk.chars.txt"), "utf8").replace(/\s/g, ""));
/** 这些组件默认用 .display 渲染 title；动态标题必须传 plainTitle 退回正文字体 */
const DISPLAY_TITLE_TAGS = new Set(["PageHeader", "DeskSection", "EmptyState", "SharedEmptyState"]);
/** 已逐项核对的动态值：分区框标题只来自 SECTION_COPY（下面单独扫描） */
const ALLOWED_DYNAMIC = new Set(["app/features/comic-workflow/canvas/WorkflowCards.tsx: .display {title}"]);
const CJK = /[\u3000-\u303f\u3400-\u9fff\uff00-\uffef]/;

const sources = globSync("app/**/*.tsx", { cwd: root })
	.filter((f) => !/\.test\.tsx$/.test(f))
	.map((file) => ({ file, text: readFileSync(resolve(root, file), "utf8") }));

function collect() {
	const strings: { file: string; text: string }[] = [];
	const dynamic: string[] = [];
	for (const { file, text } of sources) {
		const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
		const visit = (node: ts.Node) => {
			if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
				const tag = node.tagName.getText(sf);
				const attrs = node.attributes.properties.filter(ts.isJsxAttribute);
				const attr = (name: string) => attrs.find((a) => a.name.getText(sf) === name);
				const title = attr("title");
				if (DISPLAY_TITLE_TAGS.has(tag) && title && !attr("plainTitle")) {
					if (title.initializer && ts.isStringLiteral(title.initializer)) strings.push({ file, text: title.initializer.text });
					else dynamic.push(`${file}: <${tag} title=${title.initializer?.getText(sf)}>`);
				}
				const cls = attr("className")?.initializer;
				if (cls && ts.isStringLiteral(cls) && /(^|\s)display(\s|$)/.test(cls.text) && ts.isJsxOpeningElement(node)) {
					for (const child of (node.parent as ts.JsxElement).children) {
						if (ts.isJsxText(child) && child.text.trim()) strings.push({ file, text: child.text.trim() });
						else if (ts.isJsxExpression(child) && child.expression && !ts.isStringLiteral(child.expression))
							dynamic.push(`${file}: .display {${child.expression.getText(sf)}}`);
					}
				}
			}
			ts.forEachChild(node, visit);
		};
		visit(sf);
	}
	// 画布分区标题来自 SECTION_COPY
	const wf = readFileSync(resolve(root, "app/features/comic-workflow/graph/buildComicWorkflow.ts"), "utf8");
	const block = wf.slice(wf.indexOf("const SECTION_COPY"), wf.indexOf("};", wf.indexOf("const SECTION_COPY")));
	for (const m of block.matchAll(/title: "([^"]*)"/g)) strings.push({ file: "buildComicWorkflow.ts", text: m[1] });
	return { strings, dynamic: dynamic.filter((d) => !ALLOWED_DYNAMIC.has(d)) };
}

describe("标题字体字形覆盖", () => {
	const { strings, dynamic } = collect();

	it("找到了固定标题（防止扫描失效）", () => {
		expect(strings.length).toBeGreaterThan(15);
	});

	it("固定标题里的每个汉字都在子集里", () => {
		const missing = strings.flatMap(({ file, text }) =>
			[...text].filter((c) => CJK.test(c) && !CHARS.has(c)).map((c) => `${c} ← ${file}「${text}」`),
		);
		expect(missing).toEqual([]);
	});

	it(".display 不接收动态文本（用户内容走正文字体）", () => {
		// 允许 {"字面量"} 与已在子集里的 children；其余动态值需要 plainTitle 或换成普通 class
		expect(dynamic).toEqual([]);
	});
});
