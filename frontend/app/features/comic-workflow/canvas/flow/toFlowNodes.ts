import type { Node } from "@xyflow/react";
import type {
	ComicWorkflowGraph,
	ComicWorkflowNode,
	ComicWorkflowSection,
} from "../../graph/types";
import type { ComicWorkflowLayout } from "../../graph/layoutComicWorkflow";

export type WorkflowInteractionMode = "layout" | "sort" | "locked";

export type FrameNodeData = {
	section: ComicWorkflowSection;
	title: string;
	eyebrow: string;
	countLabel: string;
	draggable: boolean;
	empty: boolean;
};
export type CardNodeData = { node: ComicWorkflowNode; draggable: boolean };

export type FrameFlowNode = Node<FrameNodeData, "frame">;
export type CardFlowNode = Node<CardNodeData, "card">;
export type WorkflowFlowNode = FrameFlowNode | CardFlowNode;

export const frameNodeId = (section: ComicWorkflowSection) => `frame:${section}`;

/**
 * graph + layout → React Flow 节点。分区框在前（父节点必须先于子节点），
 * 卡片用相对父框的坐标，拖框时卡片跟着走；只有排序模式下的分镜卡可拖。
 */
export function toFlowNodes(
	graph: ComicWorkflowGraph,
	layout: ComicWorkflowLayout,
	mode: WorkflowInteractionMode,
	framePositions: Record<string, { x: number; y: number }> = {},
): WorkflowFlowNode[] {
	const frames = new Map(layout.frames.map((f) => [f.section, f]));
	const frameNodes: FrameFlowNode[] = layout.frames.map((frame) => {
		const section = graph.sections.find((s) => s.section === frame.section);
		const id = frameNodeId(frame.section);
		const draggable = mode === "layout";
		return {
			id,
			type: "frame",
			position: framePositions[id] ?? { x: frame.x, y: frame.y },
			width: frame.w,
			height: frame.h,
			draggable,
			selectable: false,
			focusable: false,
			zIndex: 0,
			data: {
				section: frame.section,
				title: section?.title ?? frame.section,
				eyebrow: section?.eyebrow ?? "",
				countLabel: section?.countLabel ?? "",
				draggable,
				empty: !layout.nodes.some((n) => n.node.section === frame.section),
			},
		};
	});
	const cardNodes: CardFlowNode[] = layout.nodes.flatMap((item) => {
		const parent = frames.get(item.node.section);
		if (!parent) return [];
		const draggable = mode === "sort" && item.node.kind === "shot";
		return [
			{
				id: item.id,
				type: "card",
				parentId: frameNodeId(parent.section),
				extent: "parent" as const,
				position: { x: item.x - parent.x, y: item.y - parent.y },
				width: item.w,
				height: item.h,
				draggable,
				zIndex: 1,
				ariaLabel: item.node.title,
				data: { node: item.node, draggable },
			},
		];
	});
	return [...frameNodes, ...cardNodes];
}

/** 排序模式拖完后按阅读顺序（行优先）得到新的分镜顺序；未变化返回 null。 */
export function shotReadingOrder(
	nodes: WorkflowFlowNode[],
): { shot_id: number; order: number }[] | null {
	const shots = nodes
		.filter((n): n is CardFlowNode => n.type === "card" && n.data.node.kind === "shot")
		.map((n) => ({
			id: n.data.node.entityId as number,
			order: n.data.node.kind === "shot" ? n.data.node.shot.order : 0,
			x: n.position.x,
			// 行号按卡片高度取整：拖动时上下偏一点不会换行
			row: Math.round(n.position.y / ((n.height ?? 390) + 14)),
		}))
		.filter((s) => Number.isFinite(s.id));
	if (shots.length < 2) return null;
	const byPosition = [...shots].sort((a, b) =>
		a.row !== b.row ? a.row - b.row : a.x - b.x,
	);
	const byOrder = [...shots].sort((a, b) => a.order - b.order);
	if (byOrder.every((s, i) => s.id === byPosition[i].id)) return null;
	return byPosition.map((s, i) => ({ shot_id: s.id, order: i + 1 }));
}

/**
 * 键盘排序：把一个分镜按阅读顺序移动 delta 格（←/→ 为 ±1，↑/↓ 为 ±列数）。
 * 越界或不是分镜时返回 null。
 */
export function moveShot(
	nodes: WorkflowFlowNode[],
	nodeId: string,
	delta: number,
): { items: { shot_id: number; order: number }[]; title: string; position: number } | null {
	const shots = nodes
		.filter((n): n is CardFlowNode => n.type === "card" && n.data.node.kind === "shot")
		.sort((a, b) => {
			const order = (n: CardFlowNode) => (n.data.node.kind === "shot" ? n.data.node.shot.order : 0);
			return order(a) - order(b);
		});
	const from = shots.findIndex((n) => n.id === nodeId);
	const to = from + delta;
	if (from < 0 || to < 0 || to >= shots.length) return null;
	const next = [...shots];
	const [moved] = next.splice(from, 1);
	next.splice(to, 0, moved);
	return {
		items: next.map((n, i) => ({ shot_id: n.data.node.entityId as number, order: i + 1 })),
		title: moved.data.node.title,
		position: to + 1,
	};
}
