/** 画布工具快捷键（Figma / tldraw 惯例）：V 选择、H 抓手。正在输入、带修饰键时不抢。 */
export function toolForKey(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "target">): "select" | "hand" | null {
	if (event.metaKey || event.ctrlKey || event.altKey) return null;
	const target = event.target as HTMLElement | null;
	if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return null;
	const key = event.key.toLowerCase();
	return key === "v" ? "select" : key === "h" ? "hand" : null;
}
