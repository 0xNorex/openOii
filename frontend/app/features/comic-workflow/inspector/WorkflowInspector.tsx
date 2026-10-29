import { useEffect, useState } from "react";
import { EmptyState } from "~/components/ui/EmptyState";
import { SvgIcon } from "~/components/ui/SvgIcon";
import type { ComicWorkflowNode } from "../graph/types";
import { PlainButton } from "../../../components/ui/PlainButton";
import { GenerationSection } from "./GenerationSection";
import { HistorySection } from "./HistorySection";
import { MultiShotActions } from "./MultiShotActions";
import { PropertiesSection } from "./PropertiesSection";
import { SelectionSection } from "./SelectionSection";

type InspectorTab = "selection" | "properties" | "generation" | "history";

interface WorkflowInspectorProps {
	projectId: number;
	selectedNode: ComicWorkflowNode | null;
	selectedNodeIds?: string[];
	structureLocked: boolean;
	universeId?: number | null;
}

const TAB_LABELS: Record<InspectorTab, string> = {
	selection: "选区",
	properties: "属性",
	generation: "生成",
	history: "历史",
};

export function WorkflowInspector({
	projectId,
	selectedNode,
	selectedNodeIds = [],
	structureLocked,
	universeId = null,
}: WorkflowInspectorProps) {
	const [activeTab, setActiveTab] = useState<InspectorTab>("selection");

	useEffect(() => {
		setActiveTab("selection");
	}, [selectedNode?.id]);

	const multiShotIds = selectedNodeIds
		.filter((id) => id.startsWith("shot:"))
		.map((id) => Number(id.split(":")[1]))
		.filter((n) => Number.isFinite(n));

	if (!selectedNode && multiShotIds.length === 0) {
		return (
			<EmptyState
				compact
				icon={<SvgIcon name="layers" size={22} />}
				title="选择画布卡片"
				description="可多选分镜格 · 批量重做本格"
				className="h-full"
			/>
		);
	}

	if (!selectedNode && multiShotIds.length > 0) {
		return (
			<MultiShotActions
				projectId={projectId}
				shotIds={multiShotIds}
				structureLocked={structureLocked}
			/>
		);
	}

	if (!selectedNode) return null;

	return (
		<div className="flex h-full min-h-0 flex-col bg-paper-100" data-shell="inspector">
			<div className="border-b border-line px-2 py-1.5">
				<p className="m-0 font-mono text-xs uppercase text-ink-muted">
					{selectedNode.kind}
				</p>
				<h2 className="m-0 truncate text-sm font-bold">
					{selectedNode.title}
				</h2>
				<p className="m-0 truncate text-xs text-ink-muted">
					{selectedNode.subtitle}
				</p>
			</div>

			<div className="flex gap-0.5 border-b border-line p-0.5">
				{(Object.keys(TAB_LABELS) as InspectorTab[]).map((tab) => (
					<PlainButton
						key={tab}
						className={`touch-target-dense flex-1 rounded-sm text-xs font-semibold transition-colors duration-fast ${
							activeTab === tab
								? "bg-primary text-primary-content"
								: "text-ink-muted hover:bg-paper-200"
						}`}
						onClick={() => setActiveTab(tab)}
					>
						{TAB_LABELS[tab]}
					</PlainButton>
				))}
			</div>

			<div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
				{activeTab === "selection" ? (
					<SelectionSection node={selectedNode} />
				) : null}
				{activeTab === "properties" ? (
					<PropertiesSection
						projectId={projectId}
						node={selectedNode}
						structureLocked={structureLocked}
					/>
				) : null}
				{activeTab === "generation" ? (
					<GenerationSection
						projectId={projectId}
						node={selectedNode}
						structureLocked={structureLocked}
						universeId={universeId}
						multiShotIds={multiShotIds}
					/>
				) : null}
				{activeTab === "history" ? <HistorySection node={selectedNode} /> : null}
			</div>
		</div>
	);
}
