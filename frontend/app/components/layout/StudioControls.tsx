import {
	ArrowPathIcon,
	StopIcon,
	SparklesIcon,
	ClockIcon,
	ArrowDownTrayIcon,
	EllipsisHorizontalIcon,
} from "@heroicons/react/24/outline";
import { STAGE_PIPELINE, getPipelineStageIndex } from "~/utils/pipeline";
import { IconButton } from "~/components/ui/IconButton";
import { Button } from "~/components/ui/Button";
import {
	type StudioStatus,
	studioStatusDotClass,
} from "~/features/comic-workflow/state/deriveStudioStatus";
import { useEffect, useRef, useState } from "react";
import { PlainButton } from "~/components/ui/PlainButton";

interface StudioControlsProps {
	isGenerating: boolean;
	studioStatus: StudioStatus;
	awaitingConfirm: boolean;
	hasRecovery: boolean;
	onGenerate?: () => void;
	onResume: () => void;
	onCancel: () => void;
	/** Status pill click: open the pending / chat panel. */
	onOpenInbox?: () => void;
	generateDisabled?: boolean;
	/** Open version history / compare drawer. */
	onOpenVersions?: () => void;
	/** Trigger export (e.g. webtoon). */
	onExport?: () => void;
	exportBusy?: boolean;
}

const chromeBtn =
	"gap-1 !px-2 text-xs";

// 执行动作后收起 focus 展开的菜单。
function runMenuAction(action: () => void) {
	if (document.activeElement instanceof HTMLElement) {
		document.activeElement.blur();
	}
	action();
}

/**
 * Top-bar centre for the workbench: one status pill (opens the inbox) and the
 * run actions. The old stage row is gone; the pill names the stage instead.
 */
export function StudioControls({
	isGenerating,
	studioStatus,
	awaitingConfirm,
	hasRecovery,
	onGenerate,
	onResume,
	onCancel,
	onOpenInbox,
	generateDisabled,
	onOpenVersions,
	onExport,
	exportBusy = false,
}: StudioControlsProps) {
	const [toolsOpen, setToolsOpen] = useState(false);
	const toolsRef = useRef<HTMLDivElement>(null);
	useEffect(() => {
		if (!toolsOpen) return;
		const closeOnOutsideClick = (event: PointerEvent) => {
			if (!toolsRef.current?.contains(event.target as Node)) setToolsOpen(false);
		};
		document.addEventListener("pointerdown", closeOnOutsideClick);
		return () => document.removeEventListener("pointerdown", closeOnOutsideClick);
	}, [toolsOpen]);
	// 阶段与进度只在运行活跃时出现（stage / progress 由 deriveStudioStatus 置空）
	const stageIndex = studioStatus.stage ? getPipelineStageIndex(studioStatus.stage) : -1;
	const stageLabel = stageIndex >= 0 ? STAGE_PIPELINE[stageIndex].label : null;
	const progressPercent =
		studioStatus.progress === null ? null : Math.round(studioStatus.progress * 100);
	const generateLabel =
		studioStatus.state === "idle"
			? "开始生成"
			: studioStatus.state === "failed" ||
					studioStatus.state === "recoverable"
				? "重试失败阶段"
				: "重新生成";
	const hasTools = Boolean(onOpenVersions || onExport);
	const pillText = [studioStatus.label, stageLabel, progressPercent === null ? null : `${progressPercent}%`]
		.filter(Boolean)
		.join(" · ");

	return (
		<>
		<span className="sr-only" aria-live="polite">
			工作台状态：{pillText}
		</span>
		{/* <sm 顶栏放不下：移动端的状态与重试在 MobileWorkbenchPreview 里 */}
		<div className="hidden min-w-0 items-center gap-1.5 sm:flex" data-shell="studio-controls">

			<PlainButton
				className={`touch-target-dense inline-flex min-w-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold tabular-nums transition-colors duration-fast ${
					awaitingConfirm
						? "border-primary bg-primary text-primary-content"
						: "border-ink/15 bg-surface text-ink hover:border-primary"
				}`}
				onClick={onOpenInbox}
				title={studioStatus.description}
				aria-label={`状态：${pillText}，打开待处理`}
			>
				<span
					className={`h-2 w-2 shrink-0 rounded-full ${studioStatusDotClass(studioStatus)}`}
					aria-hidden="true"
				/>
				<span className="truncate">{pillText}</span>
				{studioStatus.pendingCount > 0 ? (
					<span className="rounded-full bg-paper-100 px-1.5 text-ink">{studioStatus.pendingCount}</span>
				) : null}
			</PlainButton>

			<div className="flex shrink-0 items-center gap-1">
				{hasTools ? (
					// 版本/一致性/导出收进溢出菜单：所有视口可达（<sm 原先整组消失，导出无入口）
					<div ref={toolsRef} className="relative" onKeyDown={(event) => event.key === "Escape" && setToolsOpen(false)}>
						<IconButton
							aria-label="工作台工具"
							aria-haspopup="menu"
							aria-expanded={toolsOpen}
							title="版本 / 一致性 / 导出"
							onClick={() => setToolsOpen((open) => !open)}
						>
							<EllipsisHorizontalIcon className="h-4 w-4" aria-hidden="true" />
						</IconButton>
						{toolsOpen ? <ul
							tabIndex={0}
							role="menu"
							aria-label="工作台工具菜单"
							className="absolute right-0 top-full z-popover mt-1 w-44 list-none rounded-md border border-ink/15 bg-surface p-1 shadow-panel"
						>
							{onOpenVersions ? (
								<li role="none">
									<PlainButton
										role="menuitem"
										className="gap-2 text-xs"
										onClick={() => { setToolsOpen(false); runMenuAction(onOpenVersions); }}
										aria-label="打开版本对比"
									>
										<ClockIcon className="h-3.5 w-3.5" aria-hidden="true" />
										版本对比
									</PlainButton>
								</li>
							) : null}
							{onExport ? (
								<li role="none">
									<PlainButton
										role="menuitem"
										className="gap-2 text-xs"
										onClick={() => { setToolsOpen(false); runMenuAction(onExport); }}
										disabled={exportBusy || isGenerating}
										aria-label="导出 Webtoon 长图"
									>
										<ArrowDownTrayIcon className="h-3.5 w-3.5" aria-hidden="true" />
										{exportBusy ? "导出中…" : "导出 Webtoon"}
									</PlainButton>
								</li>
							) : null}
						</ul> : null}
					</div>
				) : null}

				{hasRecovery && !isGenerating ? (
					<>
						<Button
							variant="primary"
							size="sm"
							className={chromeBtn}
							onClick={onResume}
						>
							<ArrowPathIcon className="h-3.5 w-3.5" aria-hidden="true" />
							恢复
						</Button>
						<IconButton onClick={onCancel} aria-label="停止当前任务">
							<StopIcon className="h-3.5 w-3.5" aria-hidden="true" />
						</IconButton>
					</>
				) : null}
				{isGenerating ? (
					<Button
						variant="ghost"
						size="sm"
						className={`${chromeBtn} text-error-fg`}
						onClick={onCancel}
					>
						<StopIcon className="h-3.5 w-3.5" aria-hidden="true" />
						停止
					</Button>
				) : null}
				{!isGenerating && !hasRecovery && !awaitingConfirm && onGenerate ? (
					<Button
						variant="primary"
						size="sm"
						className={chromeBtn}
						onClick={onGenerate}
						disabled={generateDisabled}
					>
						<SparklesIcon className="h-3.5 w-3.5" aria-hidden="true" />
						{generateLabel}
					</Button>
				) : null}
			</div>
		</div>
		</>
	);
}
