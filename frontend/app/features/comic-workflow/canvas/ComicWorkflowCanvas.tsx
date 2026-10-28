import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ImagePreviewModal, VideoPreviewModal } from "~/components/canvas/PreviewModals";
import { canvasEvents } from "~/components/canvas/canvasEvents";
import { projectQueryKeys } from "~/query/queryKeys";
import { projectsApi } from "~/services/api";
import { useRunState } from "~/hooks/useRunState";
import type { ComicWorkflowGraph } from "../graph/types";
import { buildComicWorkflow } from "../graph/buildComicWorkflow";
import { layoutComicWorkflow } from "../graph/layoutComicWorkflow";
import { FlowWorkflowView } from "./flow/FlowWorkflowView";
import type { WorkflowInteractionMode } from "./flow/toFlowNodes";

interface ComicWorkflowCanvasProps {
	projectId: number;
	onSelectedNodeIdChange?: (nodeId: string | null) => void;
	/** Multi-select 九宫格 / cast binding (ordered, primary first). */
	onSelectedNodeIdsChange?: (nodeIds: string[]) => void;
	/** Opens the asset library from the canvas toolbar. */
	onOpenAssets?: () => void;
	/** 浮动面板占掉的左右宽度（px），适应视图时避开。 */
	fitInsets?: { left: number; right: number };
}

export function ComicWorkflowCanvas({
	projectId,
	onSelectedNodeIdChange,
	onSelectedNodeIdsChange,
	onOpenAssets,
	fitInsets,
}: ComicWorkflowCanvasProps) {
	const [previewImage, setPreviewImage] = useState<{
		src: string;
		alt: string;
	} | null>(null);
	const [previewVideo, setPreviewVideo] = useState<{
		src: string;
		title: string;
	} | null>(null);

	const { isGenerating, awaitingConfirm, currentRunId } = useRunState(projectId);

	const { data: project, isLoading: projectLoading } = useQuery({
		queryKey: projectQueryKeys.project(projectId),
		queryFn: () => projectsApi.get(projectId),
		enabled: projectId > 0,
	});
	const { data: characters = [], isLoading: charactersLoading } = useQuery({
		queryKey: projectQueryKeys.characters(projectId),
		queryFn: () => projectsApi.getCharacters(projectId),
		enabled: projectId > 0,
	});
	const { data: shots = [], isLoading: shotsLoading } = useQuery({
		queryKey: projectQueryKeys.shots(projectId),
		queryFn: () => projectsApi.getShots(projectId),
		enabled: projectId > 0,
	});

	const graph = useMemo<ComicWorkflowGraph | null>(() => {
		if (!project) return null;
		return buildComicWorkflow({
			project,
			characters,
			shots,
			blockingClips: project.blocking_clips,
			isGenerating,
			awaitingConfirm,
		});
	}, [project, characters, shots, isGenerating, awaitingConfirm]);

	const layout = useMemo(
		() => (graph ? layoutComicWorkflow(graph) : null),
		[graph],
	);
	const structureLocked = isGenerating || awaitingConfirm || Boolean(currentRunId);
	const [sortMode, setSortMode] = useState(false);
	const interactionMode: WorkflowInteractionMode = structureLocked
		? "locked"
		: sortMode
			? "sort"
			: "layout";

	useEffect(() => {
		if (structureLocked && sortMode) setSortMode(false);
	}, [structureLocked, sortMode]);

	useEffect(() => {
		const unsubscribers = [
			canvasEvents.on("preview-image", setPreviewImage),
			canvasEvents.on("preview-video", setPreviewVideo),
			canvasEvents.on("select-workflow-node", ({ nodeId }) => {
				onSelectedNodeIdChange?.(nodeId);
				onSelectedNodeIdsChange?.(nodeId ? [nodeId] : []);
			}),
			canvasEvents.on("set-workflow-selection", ({ nodeIds }) => {
				onSelectedNodeIdChange?.(nodeIds[0] ?? null);
				onSelectedNodeIdsChange?.(nodeIds);
			}),
		];
		return () => {
			unsubscribers.forEach((unsubscribe) => unsubscribe());
		};
	}, [onSelectedNodeIdChange, onSelectedNodeIdsChange]);

	const toggleSortMode = useCallback(() => setSortMode((v) => !v), []);
	const endSortMode = useCallback(() => setSortMode(false), []);

	if (projectLoading || charactersLoading || shotsLoading || !graph || !layout) {
		return (
			<div className="flex h-full w-full items-center justify-center bg-paper-100 text-sm text-ink-muted">
				正在加载工作流...
			</div>
		);
	}

	return (
		<>
			<FlowWorkflowView
				projectId={projectId}
				graph={graph}
				layout={layout}
				interactionMode={interactionMode}
				sortMode={sortMode}
				structureLocked={structureLocked}
				onToggleSortMode={toggleSortMode}
				onSorted={endSortMode}
				onSelectedNodeIdChange={onSelectedNodeIdChange}
				onSelectedNodeIdsChange={onSelectedNodeIdsChange}
				onOpenAssets={onOpenAssets}
				fitInsets={fitInsets}
			/>

			{previewImage ? (
				<ImagePreviewModal
					src={previewImage.src}
					alt={previewImage.alt}
					onClose={() => setPreviewImage(null)}
				/>
			) : null}

			{previewVideo ? (
				<VideoPreviewModal
					src={previewVideo.src}
					title={previewVideo.title}
					onClose={() => setPreviewVideo(null)}
				/>
			) : null}
		</>
	);
}
