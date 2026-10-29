import { IconButton } from "~/components/ui/IconButton";
import { BUTTON_BASE, BUTTON_VARIANTS, Button } from "~/components/ui/Button";
import {
	type StudioStatus,
	studioStatusDotClass,
	studioStatusText,
} from "~/features/comic-workflow/state/deriveStudioStatus";
import { useEffect, useRef, useState } from "react";
import { PlainButton } from "~/components/ui/PlainButton";
import { SvgIcon } from "~/components/ui/SvgIcon";

interface StudioControlsProps {
	isGenerating: boolean;
	studioStatus: StudioStatus;
	awaitingConfirm: boolean;
	hasRecovery: boolean;
	onGenerate?: () => void;
	onCancel: () => void;
	/** Status pill click: open the pending / chat panel. */
	onOpenInbox?: () => void;
	generateDisabled?: boolean;
	/** Open version history / compare drawer. */
	onOpenVersions?: () => void;
	/** Trigger export (e.g. webtoon). */
	onExport?: () => void;
	exportBusy?: boolean;
	/** 成片下载地址；完成后它是顶栏主按钮（CapCut / Runway 的「导出」位置） */
	downloadUrl?: string | null;
	/** 正在创建运行（POST runs 在途）：按钮立刻进入忙碌态 */
	generatePending?: boolean;
	/**
	 * 已有产物时的「重新生成」：收进 ··· 菜单，先弹确认（重做什么、多久、多少调用）。
	 * 不传时退回旧行为（顶栏主按钮直接重新生成）。
	 */
	onRegenerate?: () => void;
	/** 恢复重新生成之前的那一版 */
	onRestorePrevious?: () => void;
	restoreBusy?: boolean;
	/** 重新生成进行中时，上一版成片仍可下载 */
	previousDownloadUrl?: string | null;
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
	onCancel,
	onOpenInbox,
	generateDisabled,
	onOpenVersions,
	onExport,
	exportBusy = false,
	downloadUrl = null,
	generatePending = false,
	onRegenerate,
	onRestorePrevious,
	restoreBusy = false,
	previousDownloadUrl = null,
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
	// “从失败阶段重试”只在收件箱；这里只有开始 / 重新生成
	const idle = studioStatus.state === "idle";
	const generateLabel = idle ? "开始生成" : "重新生成";
	const canStart = !isGenerating && !hasRecovery && !awaitingConfirm;
	// 有产物之后，重新生成不再是一个随手就点到的主按钮
	const regenerateInMenu = Boolean(onRegenerate) && !idle;
	const showMainGenerate = Boolean(onGenerate) && (generatePending || (canStart && !regenerateInMenu));
	const hasTools = Boolean(
		onOpenVersions || onExport || regenerateInMenu || onRestorePrevious || previousDownloadUrl,
	);
	// 成片可用时：下载是主操作，重新生成退为次要
	const finished = studioStatus.state === "ready" && Boolean(downloadUrl) && !isGenerating;
	// 步骤只在运行活跃时出现：按六步计数，不再显示会卡在 50% 的百分比
	const pillText = studioStatusText(studioStatus);

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
						: "border-line bg-surface text-ink hover:border-primary"
				}`}
				onClick={onOpenInbox}
				title={studioStatus.description}
				aria-label={`状态：${pillText}，打开待处理`}
			>
				<span
					className={`h-2 w-2 shrink-0 rounded-full ${awaitingConfirm ? "bg-primary-content" : studioStatusDotClass(studioStatus)}`}
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
							<SvgIcon name="more-horiz" size={16} />
						</IconButton>
						{toolsOpen ? <ul
							tabIndex={0}
							role="menu"
							aria-label="工作台工具菜单"
							className="animate-enter absolute right-0 top-full z-popover mt-1 w-44 list-none rounded-md border border-line bg-surface p-1 shadow-panel"
						>
							{regenerateInMenu && onRegenerate ? (
								<li role="none">
									<PlainButton
										role="menuitem"
										className="gap-2 text-xs"
										onClick={() => { setToolsOpen(false); runMenuAction(onRegenerate); }}
										disabled={!canStart || generatePending || generateDisabled}
										aria-label="重新生成（先确认）"
									>
										<SvgIcon name="sparks" size={14} />
										重新生成…
									</PlainButton>
								</li>
							) : null}
							{onRestorePrevious ? (
								<li role="none">
									<PlainButton
										role="menuitem"
										className="gap-2 text-xs"
										onClick={() => { setToolsOpen(false); runMenuAction(onRestorePrevious); }}
										disabled={restoreBusy || isGenerating}
										aria-label="恢复上一版"
									>
										<SvgIcon name="refresh-cw" size={14} />
										{restoreBusy ? "恢复中…" : "恢复上一版"}
									</PlainButton>
								</li>
							) : null}
							{previousDownloadUrl ? (
								<li role="none">
									<a
										role="menuitem"
										href={previousDownloadUrl}
										download
										target="_blank"
										rel="noopener"
										className="flex w-full touch-target-dense items-center gap-2 rounded-md px-2 text-xs text-ink hover:bg-paper-200"
										onClick={() => setToolsOpen(false)}
									>
										<SvgIcon name="download" size={14} />
										下载上一版成片
									</a>
								</li>
							) : null}
							{onOpenVersions ? (
								<li role="none">
									<PlainButton
										role="menuitem"
										className="gap-2 text-xs"
										onClick={() => { setToolsOpen(false); runMenuAction(onOpenVersions); }}
										aria-label="打开版本对比"
									>
										<SvgIcon name="clock-3" size={14} />
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
										<SvgIcon name="download" size={14} />
										{exportBusy ? "导出中…" : "导出 Webtoon"}
									</PlainButton>
								</li>
							) : null}
						</ul> : null}
					</div>
				) : null}

				{/* 恢复 / 取消只在收件箱；这里只放生成和停止 */}
				{isGenerating ? (
					<Button
						variant="ghost"
						size="sm"
						className={`${chromeBtn} text-error-fg`}
						onClick={onCancel}
					>
						<SvgIcon name="stop" size={14} />
						停止
					</Button>
				) : null}
				{showMainGenerate && onGenerate ? (
					<Button
						variant={finished ? "secondary" : "primary"}
						size="sm"
						className={chromeBtn}
						onClick={onGenerate}
						disabled={generateDisabled || generatePending}
						aria-busy={generatePending}
					>
						{generatePending ? (
							<span className="spinner-doodle h-3.5 w-3.5" aria-hidden="true" />
						) : (
							<SvgIcon name="sparks" size={14} />
						)}
						{generatePending ? "正在创建…" : generateLabel}
					</Button>
				) : null}
				{finished && downloadUrl ? (
					<a
						href={downloadUrl}
						download
						// 成片在另一个源上：新标签打开，工作台留在原处
						target="_blank"
						rel="noopener"
						className={`${BUTTON_BASE} ${BUTTON_VARIANTS.primary} h-8 touch-target-dense ${chromeBtn}`}
					>
						<SvgIcon name="download" size={14} />
						下载成片
					</a>
				) : null}
			</div>
		</div>
		</>
	);
}
