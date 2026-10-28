import { ChevronDoubleRightIcon, Squares2X2Icon } from "@heroicons/react/24/outline";
import { IconButton } from "~/components/ui/IconButton";
import { PlainButton } from "~/components/ui/PlainButton";
import type { ComicWorkflowNode } from "../graph/types";
import { UniverseTimelinePanel } from "./UniverseTimelinePanel";
import { WorkflowInspector } from "./WorkflowInspector";

interface InspectorPanelProps {
	projectId: number;
	selectedNode: ComicWorkflowNode | null;
	selectedNodeIds?: string[];
	structureLocked: boolean;
	universeId?: number | null;
	/** 画布不承载 Brief；未选中时显示项目视图（Brief + 宇宙时间线）。 */
	briefNode?: ComicWorkflowNode | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

/**
 * 检查器：浮在画布右侧（320px），可收成胶囊。
 * 选中即看属性；未选中时回落到项目视图。开合由工作台控制（窄屏与 Agent 面板互斥）。
 */
export function InspectorPanel({
	projectId,
	selectedNode,
	selectedNodeIds = [],
	structureLocked,
	universeId = null,
	briefNode = null,
	open,
	onOpenChange,
}: InspectorPanelProps) {
	const hasSelection = Boolean(selectedNode) || selectedNodeIds.length > 0;
	const activeNode = selectedNode ?? briefNode;
	if (!activeNode && selectedNodeIds.length === 0) return null;

	if (!open) {
		return (
			<PlainButton
				className="absolute right-3 top-3 z-panel inline-flex touch-target-dense items-center gap-1.5 rounded-full border border-ink/15 bg-surface px-3 text-xs font-semibold shadow-panel transition-colors duration-fast hover:border-primary"
				onClick={() => onOpenChange(true)}
				aria-label="展开检查器"
				aria-expanded={false}
				data-shell="inspector-panel"
			>
				<Squares2X2Icon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
				{hasSelection ? "检查器" : "项目"}
			</PlainButton>
		);
	}

	return (
		<aside
			className="absolute bottom-16 right-3 top-3 z-panel flex w-80 max-w-[calc(100%-1.5rem)] flex-col overflow-hidden rounded-lg border border-ink/15 bg-surface shadow-panel"
			aria-label="检查器"
			data-shell="inspector-panel"
			onKeyDown={(event) => {
				// Esc 收起；输入框里的 Esc 留给输入框
				const target = event.target as HTMLElement;
				if (event.key !== "Escape" || target.closest("input, textarea, select")) return;
				onOpenChange(false);
			}}
		>
			<div className="flex items-center justify-between gap-1 border-b border-ink/10 py-1 pl-3 pr-1">
				<h2 className="text-sm font-semibold">{hasSelection ? "检查器" : "项目"}</h2>
				<IconButton
					className="shrink-0 text-ink-muted hover:text-ink"
					onClick={() => onOpenChange(false)}
					aria-label="收起检查器"
					aria-expanded
					title="收起检查器"
				>
					<ChevronDoubleRightIcon className="h-3.5 w-3.5" aria-hidden="true" />
				</IconButton>
			</div>
			<div className="min-h-0 flex-1 overflow-hidden">
				<WorkflowInspector
					projectId={projectId}
					selectedNode={activeNode}
					selectedNodeIds={selectedNodeIds}
					structureLocked={structureLocked}
					universeId={universeId}
				/>
			</div>
			{!hasSelection && universeId != null ? (
				<section className="max-h-[45%] shrink-0 overflow-y-auto border-t border-ink/10" aria-label="宇宙时间线">
					<UniverseTimelinePanel universeId={universeId} currentProjectId={projectId} />
				</section>
			) : null}
		</aside>
	);
}
