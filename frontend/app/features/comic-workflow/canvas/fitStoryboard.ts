import type { Editor } from "tldraw";
import { WORKFLOW_FRAME_META } from "./syncTldrawProjection";

/** 卡片标题是 text-sm（13px）：缩放不低于 12/13，屏幕字号就 ≥ 12px。 */
export const READABLE_ZOOM = 12 / 13;
const INSET = 48;

/**
 * 适配分镜区（没有分镜时适配整页），并保证文字可读：
 * 放得下就居中；放不下就停在可读下限，从分镜区左上角开始看。
 */
export function fitStoryboard(editor: Editor, duration: number) {
	const frame = editor
		.getCurrentPageShapes()
		.find((shape) => shape.meta?.[WORKFLOW_FRAME_META] === "shotline");
	const bounds = frame
		? editor.getShapePageBounds(frame)
		: editor.getCurrentPageBounds();
	if (!bounds || bounds.w === 0 || bounds.h === 0) return;

	const viewport = editor.getViewportScreenBounds();
	const fit = Math.min(
		(viewport.w - INSET * 2) / bounds.w,
		(viewport.h - INSET * 2) / bounds.h,
	);
	const z = Math.min(1, Math.max(READABLE_ZOOM, fit));
	const camera =
		fit >= READABLE_ZOOM
			? {
					x: (viewport.w / z - bounds.w) / 2 - bounds.x,
					y: (viewport.h / z - bounds.h) / 2 - bounds.y,
					z,
				}
			: { x: INSET / z - bounds.x, y: INSET / z - bounds.y, z };
	editor.setCamera(camera, { animation: { duration } });
}
