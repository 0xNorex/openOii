import { useEffect, useRef } from "react";
import type { ComicWorkflowNode } from "../../graph/types";
import { GenerationSection } from "../../inspector/GenerationSection";

export interface CardMenuState {
	node: ComicWorkflowNode;
	x: number;
	y: number;
}

const MENU_WIDTH = 240;
const MENU_HEIGHT = 320;

/** 把菜单夹在画布容器里，靠边时不被裁掉。 */
export function menuPosition(
	point: { x: number; y: number },
	box: { left: number; top: number; width: number; height: number },
): { x: number; y: number } {
	return {
		x: Math.max(8, Math.min(point.x - box.left, box.width - MENU_WIDTH - 8)),
		y: Math.max(8, Math.min(point.y - box.top, box.height - MENU_HEIGHT - 8)),
	};
}

/** 右键菜单：直接复用检查器「生成」页的动作，不另起一套。 */
export function CardContextMenu({
	menu,
	projectId,
	structureLocked,
	onClose,
}: {
	menu: CardMenuState;
	projectId: number;
	structureLocked: boolean;
	onClose: () => void;
}) {
	const ref = useRef<HTMLElement>(null);

	useEffect(() => {
		ref.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
		const onKey = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		const onPointer = (event: PointerEvent) => {
			if (!ref.current?.contains(event.target as Node)) onClose();
		};
		window.addEventListener("keydown", onKey);
		window.addEventListener("pointerdown", onPointer, true);
		return () => {
			window.removeEventListener("keydown", onKey);
			window.removeEventListener("pointerdown", onPointer, true);
		};
	}, [onClose]);

	return (
		<section
			ref={ref}
			aria-label={`${menu.node.title} 的操作`}
			className="absolute z-popover w-60 rounded-lg border border-line bg-surface p-2 shadow-panel"
			style={{ left: menu.x, top: menu.y }}
			onClickCapture={(event) => {
				// 点了动作就收起；动作本身照常执行
				if ((event.target as HTMLElement).closest("button")) setTimeout(onClose, 0);
			}}
		>
			<GenerationSection
				projectId={projectId}
				node={menu.node}
				structureLocked={structureLocked}
				compact
			/>
		</section>
	);
}
