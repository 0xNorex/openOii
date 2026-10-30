import { useSyncExternalStore } from "react";

// 与 Tailwind lg 断点对齐：<1024px 视为移动工作台（不挂载画布）
const MOBILE_QUERY = "(max-width: 1023.98px)";

function canMatchMedia(): boolean {
	return typeof window !== "undefined" && typeof window.matchMedia === "function";
}

function subscribe(onChange: () => void): () => void {
	if (!canMatchMedia()) return () => {};
	const mql = window.matchMedia(MOBILE_QUERY);
	mql.addEventListener("change", onChange);
	return () => mql.removeEventListener("change", onChange);
}

function getSnapshot(): boolean {
	// 测试环境（jsdom）无 matchMedia 时按桌面处理，保持既有桌面行为
	if (!canMatchMedia()) return false;
	return window.matchMedia(MOBILE_QUERY).matches;
}

/** 非 hook 版本：模块求值时决定预取哪一侧的 chunk；无法判断视口时返回 null */
export function isMobileWorkbenchViewport(): boolean | null {
	return canMatchMedia() ? getSnapshot() : null;
}

export function useIsMobileWorkbench(): boolean {
	return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
