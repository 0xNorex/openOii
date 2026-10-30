import { isMobileWorkbenchViewport } from "~/features/comic-workflow/mobile/useIsMobileWorkbench";
import { onIdle, preloadComponent } from "~/utils/preloadComponent";

// 移动预览和键盘层各自只在一侧视口用到，拆成独立 chunk
export const mobilePreviewChunk = preloadComponent(() =>
	import("~/features/comic-workflow/mobile/MobileWorkbenchPreview").then(
		(m) => m.MobileWorkbenchPreview,
	),
);
export const keyboardLayerChunk = preloadComponent(() =>
	import("~/features/workbench/KeyboardLayer").then((m) => m.KeyboardLayer),
);

/** 当前视口要用的那个（判断不了视口就两个都要）；开始加载并返回其 Promise */
export function loadViewportWorkbenchChunks(): Promise<unknown> {
	const mobile = isMobileWorkbenchViewport();
	const pending: Promise<unknown>[] = [];
	if (mobile !== false) pending.push(mobilePreviewChunk.load());
	if (mobile !== true) pending.push(keyboardLayerChunk.load());
	return Promise.all(pending);
}

/** 另一侧视口的 chunk 空闲时再取，旋转/拉伸窗口时不用等 */
export function prefetchOtherWorkbenchChunk(): void {
	const mobile = isMobileWorkbenchViewport();
	if (mobile === null) return;
	onIdle(() => void (mobile ? keyboardLayerChunk : mobilePreviewChunk).load().catch(() => {}));
}
