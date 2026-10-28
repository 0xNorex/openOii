import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { useQueryClient } from "@tanstack/react-query";
import {
	lazy,
	Suspense,
	useCallback,
	useEffect,
	useMemo,
	useState,
} from "react";
import { Link } from "react-router-dom";
import { TopBar } from "~/components/layout/TopBar";
import { StagePipeline } from "~/components/layout/StagePipeline";
import { StageView } from "~/components/layout/StageView";
import { Button } from "~/components/ui/Button";
import { Card } from "~/components/ui/Card";
import { canvasEvents } from "~/components/canvas/canvasEvents";
import { buildComicWorkflow } from "~/features/comic-workflow/graph/buildComicWorkflow";
import {
	WorkspaceSidebar,
	type WorkspaceSidebarTab,
} from "~/features/comic-workflow/sidebar/WorkspaceSidebar";
import { InspectorColumn } from "~/features/comic-workflow/inspector/InspectorColumn";
import { PromptBar } from "~/features/workbench/PromptBar";
import {
	deriveStudioStatus,
} from "~/features/comic-workflow/state/deriveStudioStatus";
import { MobileWorkbenchPreview } from "~/features/comic-workflow/mobile/MobileWorkbenchPreview";
import { useIsMobileWorkbench } from "~/features/comic-workflow/mobile/useIsMobileWorkbench";
import { useRunController } from "~/features/run/useRunController";
import { useProjectData } from "~/features/projects/useProjectData";
import { exportApi, getStaticUrl } from "~/services/api";
import { useRunState } from "~/hooks/useRunState";
import { useEditorStore } from "~/stores/editorStore";
import { readRunState as readRunStateSnapshot } from "~/query/runState";
import type { VersionEntityType } from "~/types";
import { ApiError } from "~/types/errors";
import { toast } from "~/utils/toast";

const VersionCompareDrawer = lazy(() =>
	import("~/components/panels/VersionCompareDrawer").then((m) => ({
		default: m.VersionCompareDrawer,
	})),
);

export function ProjectWorkbench({ projectId }: { projectId: number }) {
	const queryClient = useQueryClient();
	const runState = useRunState(projectId);
	const {
		isGenerating: runIsGenerating,
		currentRunId: runCurrentRunId,
		currentStage: runCurrentStage,
		progress: runProgress,
		awaitingConfirm: runAwaitingConfirm,
		recoveryControl: runRecoveryControl,
	} = runState;
	const runModePreference = useEditorStore((s) => s.runMode);
	const hasActiveRun = runIsGenerating || Boolean(runCurrentRunId);
	const hasRecovery = Boolean(runRecoveryControl);
	const [sidebarTab, setSidebarTab] = useState<WorkspaceSidebarTab>("chat");
	const [workspaceCollapsed, setWorkspaceCollapsed] = useState(false);
	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
	const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
	const [versionOpen, setVersionOpen] = useState(false);
	const [exporting, setExporting] = useState(false);
	const [versionTarget, setVersionTarget] = useState<{
		entityType: VersionEntityType;
		entityId: number;
	} | null>(null);

	useEffect(() => {
		return canvasEvents.on("version-history", (target) => {
			setVersionTarget({ entityType: target.entityType, entityId: target.entityId });
			setVersionOpen(true);
		});
	}, []);


	const { project, characters, shots, projectLoading, projectError } = useProjectData(projectId);
	useEffect(() => {
		setSelectedNodeId(null);
		setSelectedNodeIds([]);
		const editor = useEditorStore.getState();
		editor.setSelectedShot(null);
		editor.setSelectedCharacter(null);
		editor.setHighlightedMessage(null);
	}, [projectId]);

	const {
		handleGenerate,
		handleFeedback,
		handleConfirm,
		handleCancel,
		handleResume,
		generatePending,
		lastRunStatus,
	} = useRunController({
		projectId,
		project,
		characters,
		shots,
		currentStage: runCurrentStage,
		currentRunId: runCurrentRunId,
		isGenerating: runIsGenerating,
		recoveryControl: runRecoveryControl,
		selectedNodeId,
		selectedNodeIds,
	});

	useEffect(() => {
		if (!runIsGenerating) {
			const progress = readRunStateSnapshot(projectId).progress;
			if (progress === 1) {
				queryClient.invalidateQueries({ queryKey: ["characters", projectId] });
				queryClient.invalidateQueries({ queryKey: ["shots", projectId] });
			}
		}
	}, [runIsGenerating, projectId, queryClient]);

	useEffect(() => {
		if (runAwaitingConfirm && runModePreference === "manual") {
			setSidebarTab("chat");
			setWorkspaceCollapsed(false);
		}
	}, [runAwaitingConfirm, runModePreference]);

	const selectedWorkflowNode = useMemo(() => {
		if (!project || !selectedNodeId) return null;
		const graph = buildComicWorkflow({
			project,
			characters,
			shots,
			blockingClips: project.blocking_clips,
			isGenerating: runIsGenerating,
			awaitingConfirm: runAwaitingConfirm,
		});
		return graph.nodes.find((node) => node.id === selectedNodeId) ?? null;
	}, [project, characters, shots, selectedNodeId, runIsGenerating, runAwaitingConfirm]);

	// Brief 不在画布上（见 layoutComicWorkflow）：未选中任何卡片时，
	// 右栏 Inspector 回落到它，项目级上下文保持可达。
	const briefNode = useMemo(() => {
		if (!project) return null;
		return (
			buildComicWorkflow({
				project,
				characters,
				shots,
				blockingClips: project.blocking_clips,
				isGenerating: runIsGenerating,
			}).nodes.find((node) => node.kind === "brief") ?? null
		);
	}, [project, characters, shots, runIsGenerating]);
	const selectionLabel = selectedNodeIds.length > 1
		? selectedNodeIds.every((id) => id.startsWith("shot:"))
			? `${selectedNodeIds.length} 个分镜格`
			: selectedNodeIds.every((id) => id.startsWith("character:"))
				? `${selectedNodeIds.length} 个角色`
				: `已选择 ${selectedNodeIds.length} 项`
		: selectedWorkflowNode
			? selectedWorkflowNode.kind === "shot"
				? `分镜格 ${selectedWorkflowNode.gridCell} · ${selectedWorkflowNode.title}`
				: selectedWorkflowNode.kind === "character"
					? `角色 · ${selectedWorkflowNode.title}`
					: `项目 · ${selectedWorkflowNode.title}`
			: null;

	const handleSelectedNodeIdChange = useCallback((nodeId: string | null) => {
		setSelectedNodeId(nodeId);
	}, []);

	const handleSelectedNodeIdsChange = useCallback((nodeIds: string[]) => {
		setSelectedNodeIds(nodeIds);
		if (nodeIds[0]) {
			setSelectedNodeId(nodeIds[0]);
		} else {
			setSelectedNodeId(null);
		}
	}, []);

	// 只等项目主数据；角色/分镜/消息让各区域自行渐进加载（canvas graph 是响应式构建的）
	const workspaceLoading = projectLoading;
	const isMobileWorkbench = useIsMobileWorkbench();

	const studioStatus = useMemo(
		() =>
			deriveStudioStatus({
				isGenerating: runIsGenerating,
				currentRunId: runCurrentRunId,
				awaitingConfirm: runAwaitingConfirm,
				recoveryControl: runRecoveryControl,
				projectStatus: project?.status,
				projectVideoUrl: project?.video_url,
				blockingClips: project?.blocking_clips,
				lastRunStatus,
				currentStage: runCurrentStage,
				progress: runProgress,
			}),
		[
			runIsGenerating,
			runCurrentRunId,
			runAwaitingConfirm,
			runRecoveryControl,
			project?.status,
			project?.video_url,
			project?.blocking_clips,
			lastRunStatus,
			runCurrentStage,
			runProgress,
		],
	);


	const handleOpenVersions = () => {
		setVersionTarget(null);
		setVersionOpen(true);
	};

	const handleExportWebtoon = async () => {
		if (exporting) return;
		setExporting(true);
		try {
			const started = await exportApi.triggerWebtoon(projectId);
			const poll = async (exportId: string): Promise<void> => {
				const response = await exportApi.getStatus(projectId, exportId);
				if (response.status === "processing") {
					await new Promise((r) => setTimeout(r, 2000));
					return poll(exportId);
				}
				if (response.status === "completed" && response.download_url) {
					const url = getStaticUrl(response.download_url);
					toast.success({
						title: "导出完成",
						message: "Webtoon 长图已生成",
						duration: 8000,
						actions: url
							? [{ label: "下载", onClick: () => window.open(url, "_blank"), variant: "primary" }]
							: undefined,
					});
					return;
				}
				toast.error({ title: "导出失败", message: "生成失败，请重试" });
			};
			toast.info({ title: "导出中", message: "正在生成 Webtoon 长图", duration: 4000 });
			await poll(started.export_id);
		} catch (error) {
			toast.error({
				title: "导出失败",
				message: error instanceof Error ? error.message : "未知错误",
			});
		} finally {
			setExporting(false);
		}
	};

	if (workspaceLoading) {
		return (
			<div className="page-shell items-center justify-center gap-3 bg-paper-100">
				<ArrowPathIcon
					className="h-5 w-5 animate-pulse text-ink-muted"
					aria-hidden="true"
				/>
				<p className="font-mono text-sm text-ink-muted">正在加载项目…</p>
			</div>
		);
	}

	const projectApiError = projectError instanceof ApiError ? projectError : null;
	const projectNotFound = projectApiError?.status === 404;

	// 非 404 的加载失败：独立错误面板 + 持久重试入口（toast 会自动消失）
	if (projectError && !projectNotFound && !project) {
		return (
			<div className="page-shell items-center justify-center bg-paper-100">
				<Card className="max-w-sm text-center">
					<h1 className="mb-2 text-xl font-bold text-pretty">
						无法加载项目
					</h1>
					<p className="mb-4 text-sm text-ink-muted">
						{projectApiError?.message || "项目数据获取失败，请检查网络后重试"}
					</p>
					<div className="flex flex-wrap items-center justify-center gap-2">
						<Button
							variant="primary"
							onClick={() =>
								queryClient.invalidateQueries({
									queryKey: ["project", projectId],
								})
							}
						>
							<ArrowPathIcon className="h-4 w-4" aria-hidden="true" />
							重试
						</Button>
						<Link to="/">
							<Button variant="ghost">返回首页</Button>
						</Link>
					</div>
				</Card>
			</div>
		);
	}

	if (!project) {
		// 「项目未找到」只留给真 404（或查询确实返回空）
		return (
			<div className="page-shell items-center justify-center bg-paper-100">
				<Card className="text-center">
					<h1 className="mb-4 text-xl font-bold text-pretty">
						项目未找到
					</h1>
					<Link to="/">
						<Button variant="primary">返回首页</Button>
					</Link>
				</Card>
			</div>
		);
	}

	return (
		<div className="page-shell bg-paper-100 font-sans" data-shell="director-desk">
			{/* 工作台是全站唯一无 h1 的页面；画布 shape 不再承载标题语义 */}
			<h1 className="sr-only">{project.title || "漫剧工作台"}</h1>
			<a
				href="#workbench-main"
				className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-toast rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-content"
			>
				跳到工作台
			</a>
			<TopBar projectId={projectId} />
			<StagePipeline
				isGenerating={hasActiveRun}
				studioStatus={studioStatus}
				awaitingConfirm={runAwaitingConfirm}
				hasRecovery={hasRecovery}
				onGenerate={handleGenerate}
				onResume={handleResume}
				onCancel={handleCancel}
				onToggleChat={() => {
					setSidebarTab("chat");
					setWorkspaceCollapsed(false);
				}}
				generateDisabled={generatePending || hasActiveRun}
				onOpenVersions={handleOpenVersions}
				onExport={handleExportWebtoon}
				exportBusy={exporting}
			/>

			{/* Keep setup focused; the empty workflow canvas appears after a run starts. */}
			<main
				id="workbench-main"
				className={
					isMobileWorkbench
						? "flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain"
						: "relative flex min-h-0 flex-1 overflow-hidden"
				}
				aria-label="漫剧工作台"
			>
				{isMobileWorkbench ? (
					<MobileWorkbenchPreview
						projectId={projectId}
						studioStatus={studioStatus}
						videoUrl={project.video_url}
						shots={shots}
						characters={characters}
						onRetry={hasRecovery ? handleResume : handleGenerate}
						retryDisabled={
							generatePending || (hasActiveRun && !hasRecovery)
						}
					/>
				) : null}

				<WorkspaceSidebar
					activeTab={sidebarTab}
					onTabChange={setSidebarTab}
					projectId={projectId}
					onConfirm={handleConfirm}
					onCancel={handleCancel}
					onSendFeedback={handleFeedback}
					isGenerating={hasActiveRun}
					collapsed={isMobileWorkbench ? false : workspaceCollapsed}
					onCollapsedChange={setWorkspaceCollapsed}
					universeId={project?.universe_id ?? null}
				/>
				{!isMobileWorkbench ? (
					<div className="flex min-w-0 flex-1 flex-col overflow-hidden">
						<div className="relative isolate min-h-0 flex-1 overflow-hidden workbench-canvas-frame">
							<StageView
								projectId={projectId}
								onSelectedNodeIdChange={handleSelectedNodeIdChange}
								onSelectedNodeIdsChange={handleSelectedNodeIdsChange}
							/>
						</div>
						{/* PromptBar 常驻画布下方：选中 → 提示 → 定点重跑 的核心入口 */}
						<PromptBar
							selectionLabel={selectionLabel}
							awaitingConfirm={runAwaitingConfirm}
							awaitingAgent={runState.awaitingAgent}
							recoveryGate={runState.recoveryGate}
							isGenerating={hasActiveRun}
							onSendFeedback={handleFeedback}
							onConfirm={handleConfirm}
						/>
					</div>
				) : null}

				{!isMobileWorkbench ? (
					<InspectorColumn
						projectId={projectId}
						selectedNode={selectedWorkflowNode}
						selectedNodeIds={selectedNodeIds}
						structureLocked={hasActiveRun || runAwaitingConfirm}
						universeId={project?.universe_id ?? null}
						briefNode={briefNode}
					/>
				) : null}
			</main>

			{isMobileWorkbench ? (
				<PromptBar
					selectionLabel={selectionLabel}
					awaitingConfirm={runAwaitingConfirm}
					awaitingAgent={runState.awaitingAgent}
					recoveryGate={runState.recoveryGate}
					isGenerating={hasActiveRun}
					onSendFeedback={handleFeedback}
					onConfirm={handleConfirm}
				/>
			) : null}

			{versionOpen && (
				<Suspense fallback={null}>
					<VersionCompareDrawer
						open
						projectId={project.id}
						initialEntityType={versionTarget?.entityType}
						initialEntityId={versionTarget?.entityId ?? null}
						onClose={() => setVersionOpen(false)}
					/>
				</Suspense>
			)}
		</div>
	);
}
