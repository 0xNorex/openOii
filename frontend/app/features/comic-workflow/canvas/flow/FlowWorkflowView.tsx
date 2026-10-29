import {
	Background,
	ReactFlow,
	ReactFlowProvider,
	useNodesState,
	useReactFlow,
	useViewport,
	type NodeProps,
	type NodeTypes,
	type OnSelectionChangeParams,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { canvasEvents } from "~/components/canvas/canvasEvents";
import { projectQueryKeys } from "~/query/queryKeys";
import { projectsApi } from "~/services/api";
import { useThemeStore } from "~/stores/themeStore";
import { motionDuration } from "~/utils/motion";
import { toast } from "~/utils/toast";
import type { ComicWorkflowGraph } from "../../graph/types";
import {
	SHOT_GRID_COLUMNS,
	type ComicWorkflowLayout,
} from "../../graph/layoutComicWorkflow";
import { WorkflowCardView, WorkflowFrameView } from "../WorkflowCards";
import {
	ComicCanvasToolbar,
	type CanvasViewControls,
} from "../toolbar/ComicCanvasToolbar";
import {
	frameNodeId,
	shotReadingOrder,
	moveShot,
	toFlowNodes,
	type CardFlowNode,
	type FrameFlowNode,
	type WorkflowFlowNode,
	type WorkflowInteractionMode,
} from "./toFlowNodes";

/** 卡片标题 13px：缩放不低于 12/13，屏幕字号就 ≥ 12px。 */
const READABLE_ZOOM = 12 / 13;
/**
 * 适配分镜区并保证文字可读：放得下就居中；放不下就停在可读下限，
 * 从左上角开始看。留白让出底部浮动提示栏 + 工具条和两侧浮动面板。
 */
export function storyboardViewport(
	bounds: { x: number; y: number; width: number; height: number },
	viewport: { width: number; height: number },
	insets = { left: 0, right: 0 },
) {
	const pad = { left: 48 + insets.left, right: 48 + insets.right, top: 48, bottom: 136 };
	const availW = Math.max(1, viewport.width - pad.left - pad.right);
	const availH = Math.max(1, viewport.height - pad.top - pad.bottom);
	const fitZoom = Math.min(availW / bounds.width, availH / bounds.height);
	const zoom = Math.min(1, Math.max(READABLE_ZOOM, fitZoom));
	const axis = (start: number, avail: number, size: number, origin: number) =>
		size * zoom <= avail
			? start + (avail - size * zoom) / 2 - origin * zoom
			: start - origin * zoom;
	return {
		x: axis(pad.left, availW, bounds.width, bounds.x),
		y: axis(pad.top, availH, bounds.height, bounds.y),
		zoom,
	};
}

const nodeTypes: NodeTypes = {
	frame: ({ data }: NodeProps<FrameFlowNode>) => (
		<WorkflowFrameView {...data} />
	),
	card: ({ data, selected }: NodeProps<CardFlowNode>) => (
		<WorkflowCardView
			node={data.node}
			draggable={data.draggable}
			selected={selected}
		/>
	),
};

type Positions = Record<string, { x: number; y: number }>;

function readPositions(key: string): Positions {
	try {
		return JSON.parse(localStorage.getItem(key) ?? "{}") as Positions;
	} catch {
		return {};
	}
}

export interface FlowWorkflowViewProps {
	projectId: number;
	graph: ComicWorkflowGraph;
	layout: ComicWorkflowLayout;
	interactionMode: WorkflowInteractionMode;
	sortMode: boolean;
	structureLocked: boolean;
	onToggleSortMode: () => void;
	onSorted: () => void;
	onSelectedNodeIdChange?: (nodeId: string | null) => void;
	onSelectedNodeIdsChange?: (nodeIds: string[]) => void;
	onOpenAssets?: () => void;
	fitInsets?: { left: number; right: number };
}

export function FlowWorkflowView(props: FlowWorkflowViewProps) {
	return (
		<ReactFlowProvider>
			<FlowInner {...props} />
		</ReactFlowProvider>
	);
}

function FlowInner({
	projectId,
	graph,
	layout,
	interactionMode,
	sortMode,
	structureLocked,
	onToggleSortMode,
	onSorted,
	onSelectedNodeIdChange,
	onSelectedNodeIdsChange,
	onOpenAssets,
	fitInsets,
}: FlowWorkflowViewProps) {
	const flow = useReactFlow<WorkflowFlowNode>();
	const { zoom } = useViewport();
	const queryClient = useQueryClient();
	const theme = useThemeStore((s) => s.theme);
	const storageKey = `openoii.flow.frames.${projectId}`;
	const [framePositions, setFramePositions] = useState<Positions>(() =>
		readPositions(storageKey),
	);
	const [nodes, setNodes, onNodesChange] = useNodesState<WorkflowFlowNode>([]);
	const [tool, setTool] = useState<"select" | "hand">("select");
	const selectedRef = useRef<string[]>([]);
	const fittedRef = useRef(false);
	// 用户自己平移/缩放之后，面板开合不再挪动画板
	const autoFitRef = useRef(true);
	const containerRef = useRef<HTMLDivElement>(null);
	const insetsRef = useRef(fitInsets);
	insetsRef.current = fitInsets;

	useEffect(() => {
		const selected = new Set(selectedRef.current);
		setNodes(
			toFlowNodes(graph, layout, interactionMode, framePositions).map((n) =>
				selected.has(n.id) ? { ...n, selected: true } : n,
			),
		);
	}, [framePositions, graph, interactionMode, layout, setNodes]);

	const fit = useCallback(
		(duration: number) => {
			const el = containerRef.current;
			const shotline = flow.getNode(frameNodeId("shotline"));
			const target = shotline ? [shotline] : flow.getNodes();
			if (!el || target.length === 0) return;
			const bounds = flow.getNodesBounds(target);
			if (bounds.width === 0 || bounds.height === 0) return;
			autoFitRef.current = true;
			void flow.setViewport(
				storyboardViewport(
					bounds,
					{ width: el.clientWidth, height: el.clientHeight },
					insetsRef.current,
				),
				{ duration },
			);
		},
		[flow],
	);

	useEffect(() => {
		if (fittedRef.current || nodes.length === 0) return;
		fittedRef.current = true;
		requestAnimationFrame(() => fit(0));
	}, [fit, nodes.length]);

	const insetLeft = fitInsets?.left ?? 0;
	const insetRight = fitInsets?.right ?? 0;
	useEffect(() => {
		if (!fittedRef.current || !autoFitRef.current) return;
		fit(motionDuration("normal"));
	}, [fit, insetLeft, insetRight]);

	const applySelection = useCallback(
		(ids: string[]) => {
			selectedRef.current = ids;
			setNodes((current) =>
				current.map((n) =>
					Boolean(n.selected) === ids.includes(n.id)
						? n
						: { ...n, selected: ids.includes(n.id) },
				),
			);
		},
		[setNodes],
	);

	useEffect(() => {
		const off = [
			canvasEvents.on("select-workflow-node", ({ nodeId }) =>
				applySelection(nodeId ? [nodeId] : []),
			),
			canvasEvents.on("set-workflow-selection", ({ nodeIds }) =>
				applySelection(nodeIds),
			),
		];
		return () => off.forEach((unsubscribe) => unsubscribe());
	}, [applySelection]);

	const handleSelectionChange = useCallback(
		({ nodes: selected }: OnSelectionChangeParams) => {
			const ids = selected.filter((n) => n.type === "card").map((n) => n.id);
			selectedRef.current = ids;
			onSelectedNodeIdsChange?.(ids);
			onSelectedNodeIdChange?.(ids[0] ?? null);
		},
		[onSelectedNodeIdChange, onSelectedNodeIdsChange],
	);

	const SORT_HINT = "排序模式：拖动分镜，或选中一格后按 Alt + 方向键移动。";
	const [announcement, setAnnouncement] = useState("");
	useEffect(() => {
		setAnnouncement(sortMode ? SORT_HINT : "");
	}, [sortMode]);

	const submitOrder = useCallback(
		// 拖动：提示后退出排序模式；键盘：留在排序模式里继续移动，结果由 aria-live 播报
		(items: { shot_id: number; order: number }[], message: string, fromKeyboard = false) =>
			projectsApi
				.reorderShots(projectId, items)
				.then(() => {
					void queryClient.invalidateQueries({ queryKey: projectQueryKeys.shots(projectId) });
					if (fromKeyboard) return;
					toast.success({ title: "九宫格已重排", message });
					onSorted();
				})
				.catch((error: Error) => {
					toast.error({ title: "重排失败", message: error.message || "请重试" });
				}),
		[onSorted, projectId, queryClient],
	);

	// 键盘排序：Alt + ←/→ 移一格，Alt + ↑/↓ 移一行；结果经 aria-live 播报
	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLDivElement>) => {
			if (interactionMode !== "sort" || !event.altKey) return;
			const delta = {
				ArrowLeft: -1,
				ArrowRight: 1,
				ArrowUp: -SHOT_GRID_COLUMNS,
				ArrowDown: SHOT_GRID_COLUMNS,
			}[event.key];
			if (!delta) return;
			const focused = (event.target as HTMLElement)
				.closest(".react-flow__node")
				?.getAttribute("data-id");
			const nodeId = focused ?? selectedRef.current[0];
			if (!nodeId?.startsWith("shot:")) return;
			event.preventDefault();
			event.stopPropagation();
			const move = moveShot(flow.getNodes(), nodeId, delta);
			if (!move) {
				setAnnouncement("已经到头了，无法再移动。");
				return;
			}
			const message = `${move.title} 移到第 ${move.position} 格`;
			setAnnouncement(message);
			void submitOrder(move.items, message, true);
		},
		[flow, interactionMode, submitOrder],
	);

	const handleDragStop = useCallback(() => {
		const current = flow.getNodes();
		if (interactionMode === "layout") {
			const next: Positions = {};
			for (const n of current) if (n.type === "frame") next[n.id] = n.position;
			localStorage.setItem(storageKey, JSON.stringify(next));
			setFramePositions(next);
			return;
		}
		if (interactionMode !== "sort") return;
		const items = shotReadingOrder(current);
		if (items) void submitOrder(items, `已按阅读顺序更新 ${items.length} 格`);
	}, [flow, interactionMode, storageKey, submitOrder]);

	const handleResetLayout = useCallback(() => {
		localStorage.removeItem(storageKey);
		setFramePositions({});
		setTimeout(() => fit(motionDuration("normal")), 80);
	}, [fit, storageKey]);

	const animation = { duration: motionDuration("fast") };
	const manual = () => {
		autoFitRef.current = false;
	};
	const controls: CanvasViewControls = {
		tool,
		setTool,
		zoomPercent: Math.round(zoom * 100),
		zoomIn: () => {
			manual();
			void flow.zoomIn(animation);
		},
		zoomOut: () => {
			manual();
			void flow.zoomOut(animation);
		},
		zoomReset: () => {
			manual();
			void flow.zoomTo(1, animation);
		},
		fit: () => fit(motionDuration("normal")),
	};

	return (
		<div
			ref={containerRef}
			className="infinite-canvas-container relative h-full w-full"
			onKeyDownCapture={handleKeyDown}
		>
			<ReactFlow<WorkflowFlowNode>
				nodes={nodes}
				edges={[]}
				nodeTypes={nodeTypes}
				onNodesChange={onNodesChange}
				onSelectionChange={handleSelectionChange}
				onNodeDragStop={handleDragStop}
				onMoveStart={(event) => {
					// event 为 null 表示程序触发（适配、动画），只有用户手势才算手动
					if (event) manual();
				}}
				colorMode={theme === "dark" ? "dark" : "light"}
				minZoom={0.2}
				maxZoom={2}
				panOnScroll
				panOnDrag={tool === "hand" ? true : [1, 2]}
				selectionOnDrag={tool === "select"}
				deleteKeyCode={null}
				multiSelectionKeyCode={["Shift", "Meta", "Control"]}
				aria-label="漫画工作流画布"
			>
				<Background gap={24} size={1} />
			</ReactFlow>
			<p
				aria-live="polite"
				className={
					announcement
						? "absolute left-1/2 top-3 z-panel m-0 -translate-x-1/2 rounded-full border border-ink/15 bg-surface px-3 py-1 text-xs text-ink shadow-panel"
						: "sr-only"
				}
			>
				{announcement}
			</p>
			<ComicCanvasToolbar
				projectId={projectId}
				onResetLayout={handleResetLayout}
				sortMode={sortMode}
				sortDisabled={structureLocked}
				onToggleSortMode={onToggleSortMode}
				fillDisabled={structureLocked}
				onOpenAssets={onOpenAssets}
				controls={controls}
			/>
		</div>
	);
}
