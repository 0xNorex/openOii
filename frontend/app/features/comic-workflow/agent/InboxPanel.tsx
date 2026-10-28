import type { ReactNode } from "react";
import {
	ArrowPathIcon,
	CheckIcon,
	ExclamationTriangleIcon,
	PencilSquareIcon,
	PlayIcon,
	XMarkIcon,
} from "@heroicons/react/24/outline";
import { OutlinePreviewCard } from "~/components/chat/OutlinePreviewCard";
import { Button } from "~/components/ui/Button";
import { PlainButton } from "~/components/ui/PlainButton";
import type { InboxItem } from "./inboxItems";

export interface InboxActions {
	onConfirm: (feedback?: string) => void;
	/** 聚焦 PromptBar，让用户写修改意见（审批时发送即带上意见继续）。 */
	onRequestChanges: () => void;
	onResume: () => void;
	onCancel: () => void;
	onRetry: () => void;
	onSelectShot: (shotId: number) => void;
	retryDisabled?: boolean;
}

function Card({
	tone,
	title,
	detail,
	children,
}: {
	tone: "primary" | "warning" | "error";
	title: string;
	detail?: string | null;
	children: ReactNode;
}) {
	const border = tone === "primary" ? "border-primary/40" : tone === "warning" ? "border-warning/50" : "border-error/50";
	return (
		<li className={`rounded-lg border ${border} bg-surface p-3`}>
			<p className="m-0 text-sm font-semibold">{title}</p>
			{detail ? <p className="m-0 mt-0.5 text-xs text-ink-muted">{detail}</p> : null}
			<div className="mt-2 space-y-2">{children}</div>
		</li>
	);
}

/**
 * 待处理收件箱（spec §6.2）。“确认继续 / 继续 / 取消 / 重试”只出现在这里。
 */
export function InboxPanel({ items, actions }: { items: InboxItem[]; actions: InboxActions }) {
	if (items.length === 0) {
		return (
			<div className="flex min-h-0 flex-1 items-center justify-center px-3 text-center">
				<p className="m-0 text-xs text-ink-muted">没有待处理事项</p>
			</div>
		);
	}

	return (
		<ul className="m-0 min-h-0 flex-1 list-none space-y-2 overflow-y-auto overscroll-contain p-3" aria-label="待处理">
			{items.map((item) => {
				if (item.kind === "gate") {
					const outline = item.gate?.story_outline;
					return (
						<Card key={item.id} tone="primary" title={item.title} detail={item.detail}>
							{outline ? (
								<OutlinePreviewCard
									outline={outline}
									visualBible={item.gate?.visual_bible}
									onRegenerate={(feedback) => actions.onConfirm(feedback)}
								/>
							) : null}
							<div className="flex gap-2">
								<Button variant="primary" size="sm" className="flex-1" onClick={() => actions.onConfirm()}>
									<CheckIcon className="h-3.5 w-3.5" aria-hidden="true" />
									确认继续
								</Button>
								<Button variant="secondary" size="sm" className="flex-1" onClick={actions.onRequestChanges}>
									<PencilSquareIcon className="h-3.5 w-3.5" aria-hidden="true" />
									提修改意见
								</Button>
							</div>
						</Card>
					);
				}
				if (item.kind === "recoverable") {
					return (
						<Card key={item.id} tone="warning" title={item.title} detail={item.detail}>
							<div className="flex gap-2">
								<Button variant="primary" size="sm" className="flex-1" onClick={actions.onResume}>
									<PlayIcon className="h-3.5 w-3.5" aria-hidden="true" />
									继续
								</Button>
								<Button variant="ghost" size="sm" className="flex-1" onClick={actions.onCancel}>
									<XMarkIcon className="h-3.5 w-3.5" aria-hidden="true" />
									取消
								</Button>
							</div>
						</Card>
					);
				}
				if (item.kind === "blocked") {
					return (
						<Card key={item.id} tone="error" title={item.title}>
							<ul className="m-0 list-none space-y-1 p-0">
								{item.clips.map((clip) => (
									<li key={clip.shot_id}>
										<PlainButton
											className="flex w-full touch-target-dense items-center gap-2 rounded-md px-2 text-left text-xs hover:bg-paper-200"
											onClick={() => actions.onSelectShot(clip.shot_id)}
											aria-label={`在画布上选中分镜 S${String(clip.order).padStart(2, "0")}`}
										>
											<ExclamationTriangleIcon className="h-3.5 w-3.5 shrink-0 text-error-fg" aria-hidden="true" />
											<span className="font-mono">S{String(clip.order).padStart(2, "0")}</span>
											<span className="min-w-0 truncate text-ink-muted">{clip.reason}</span>
										</PlainButton>
									</li>
								))}
							</ul>
						</Card>
					);
				}
				return (
					<Card key={item.id} tone="error" title={item.title} detail={item.detail}>
						<Button
							variant="primary"
							size="sm"
							className="w-full"
							onClick={actions.onRetry}
							disabled={actions.retryDisabled}
						>
							<ArrowPathIcon className="h-3.5 w-3.5" aria-hidden="true" />
							从失败阶段重试
						</Button>
					</Card>
				);
			})}
		</ul>
	);
}
