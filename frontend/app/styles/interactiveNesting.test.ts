import { readFileSync, globSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * 交互元素不嵌套：<a><button>、<button><a>、<Link><Button> 都不行（HTML 内容模型禁止；
 * 读屏读成两个控件，Tab 停两次，点击事件两层都触发）。像按钮的导航用 ButtonLink。
 */
const INTERACTIVE = new Set([
	"a", "button", "Link", "NavLink", "Button", "IconButton", "PlainButton", "ButtonLink", "MenuItem", "MenuLink",
	"summary", "select", "textarea",
]);
const root = resolve(__dirname, "../..");
const files = globSync("app/**/*.tsx", { cwd: root }).filter((f) => !/\.test\.tsx$/.test(f));

function nested(): string[] {
	const found: string[] = [];
	for (const file of files) {
		const text = readFileSync(resolve(root, file), "utf8");
		const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
		const walk = (node: ts.Node, outer: string | null) => {
			let here = outer;
			if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
				const tag = (ts.isJsxElement(node) ? node.openingElement.tagName : node.tagName).getText(sf);
				if (INTERACTIVE.has(tag)) {
					if (outer) {
						const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
						found.push(`${file}:${line + 1} <${tag}> inside <${outer}>`);
					}
					here = tag;
				}
			}
			// 属性里的 JSX（如 action={<Button/>}）是独立渲染位置，不算嵌套
			if (ts.isJsxAttribute(node)) {
				ts.forEachChild(node, (child) => walk(child, null));
				return;
			}
			ts.forEachChild(node, (child) => walk(child, here));
		};
		walk(sf, null);
	}
	return found;
}

describe("交互元素不嵌套", () => {
	it("扫描到了源码（防止 glob 失效）", () => {
		expect(files.length).toBeGreaterThan(50);
	});

	it("没有 <a>/<Link> 套按钮，也没有按钮套链接或按钮", () => {
		expect(nested()).toEqual([]);
	});
});
