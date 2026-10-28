import { clsx } from "clsx";
import { ChevronDoubleLeftIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { ChatPanel } from "~/components/chat/ChatPanel";
import { IconButton } from "~/components/ui/IconButton";
import { PlainButton } from "~/components/ui/PlainButton";

interface AgentPanelProps {
	projectId: number;
	onConfirm: (feedback?: string) => void;
	onCancel: () => void;
	isGenerating: boolean;
	collapsed: boolean;
	onCollapsedChange: (collapsed: boolean) => void;
	/** Mobile: render inline in the page flow instead of floating over the canvas. */
	inline?: boolean;
	/** Shown on the collapsed pill so a pending approval is never hidden. */
	pendingCount?: number;
}

/**
 * Agent 面板：浮在画布左侧（360px），默认展开，可收成胶囊。
 * 只承载与选中无关的活动流；资产在画布工具条，宇宙时间线在 Inspector 的项目视图。
 */
export function AgentPanel({
	projectId,
	onConfirm,
	onCancel,
	isGenerating,
	collapsed,
	onCollapsedChange,
	inline = false,
	pendingCount = 0,
}: AgentPanelProps) {
	if (collapsed && !inline) {
		return (
			<PlainButton
				className="absolute left-3 top-3 z-panel inline-flex touch-target-dense items-center gap-1.5 rounded-full border border-ink/15 bg-surface px-3 text-xs font-semibold shadow-panel transition-colors duration-fast hover:border-primary"
				onClick={() => onCollapsedChange(false)}
				aria-label="展开活动面板"
				aria-expanded={false}
				data-shell="agent-panel"
			>
				<SparklesIcon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
				活动
				{pendingCount > 0 ? (
					<span className="rounded-full bg-primary px-1.5 text-primary-content">{pendingCount}</span>
				) : null}
			</PlainButton>
		);
	}

	return (
		<aside
			className={clsx(
				"flex flex-col overflow-hidden bg-surface",
				inline
					? "h-[28rem] border-t border-ink/10"
					: "absolute bottom-16 left-3 top-3 z-panel w-[360px] max-w-[calc(100%-1.5rem)] rounded-lg border border-ink/15 shadow-panel",
			)}
			aria-label="工作流活动"
			data-shell="agent-panel"
		>
			<div className="flex items-center justify-between gap-1 border-b border-ink/10 py-1 pl-3 pr-1">
				<h2 className="m-0 inline-flex items-center gap-1.5 text-sm font-semibold">
					<SparklesIcon className="h-4 w-4 text-primary" aria-hidden="true" />
					活动
				</h2>
				{inline ? null : (
					<IconButton
						className="text-ink-muted hover:text-ink"
						onClick={() => onCollapsedChange(true)}
						aria-label="收起活动面板"
						aria-expanded
						title="收起活动面板"
					>
						<ChevronDoubleLeftIcon className="h-3.5 w-3.5" aria-hidden="true" />
					</IconButton>
				)}
			</div>
			<div className="min-h-0 flex-1 overflow-hidden">
				<ChatPanel
					projectId={projectId}
					onConfirm={onConfirm}
					onCancel={onCancel}
					isGenerating={isGenerating}
				/>
			</div>
		</aside>
	);
}
