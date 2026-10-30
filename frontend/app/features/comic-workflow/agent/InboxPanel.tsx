import { useState, type ReactNode } from "react";
import { ConfirmModal } from "~/components/ui/ConfirmModal";
import { getStaticUrl } from "~/services/api";
import { OutlinePreviewCard } from "~/components/chat/OutlinePreviewCard";
import { Button } from "~/components/ui/Button";
import { PlainButton } from "~/components/ui/PlainButton";
import type { GatePreview, InboxItem } from "./inboxItems";
import { SvgIcon } from "~/components/ui/SvgIcon";
import "~/components/ui/icons/workbenchIcons";

export interface InboxActions {
	onConfirm: (feedback?: string) => Promise<boolean> | void;
	/** 聚焦 PromptBar，让用户写修改意见（审批时发送即带上意见继续）。 */
	onRequestChanges: () => void;
	onResume: () => void;
	onCancel: () => void;
	onRetry: () => void;
	onSelectShot: (shotId: number) => void;
	/** 在画布上定位并选中某个节点（审批门缩略图） */
	onFocusNode?: (nodeId: string) => void;
	retryDisabled?: boolean;
	/** 确认/意见请求在途 */
	gatePending?: boolean;
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

function PreviewStrip({ previews, onFocus }: { previews: GatePreview[]; onFocus?: (nodeId: string) => void }) {
	// 文字关（角色设定 / 分镜脚本）还没有图：列名字，不摆一排空图框
	if (!previews.some((preview) => preview.imageUrl)) {
		return (
			<ul className="m-0 flex list-none flex-wrap gap-1 p-0" aria-label="本关要审的内容">
				{previews.map((preview) => (
					<li key={preview.nodeId}>
						<PlainButton
							className="touch-target-dense rounded-full border border-line px-2 text-xs text-ink hover:border-primary"
							onClick={() => onFocus?.(preview.nodeId)}
							title={`在画布上查看 ${preview.label}`}
						>
							{preview.label}
						</PlainButton>
					</li>
				))}
			</ul>
		);
	}
	return (
		<ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="本关要审的内容">
			{previews.map((preview) => {
				const src = getStaticUrl(preview.imageUrl);
				return (
					<li key={preview.nodeId}>
						<PlainButton
							className="flex w-14 flex-col items-center gap-0.5 rounded-md p-0.5 text-xs text-ink-muted hover:bg-paper-200"
							onClick={() => onFocus?.(preview.nodeId)}
							title={`在画布上查看 ${preview.label}`}
						>
							{src ? (
								<img
									src={src}
									alt={preview.label}
									loading="lazy"
									className="h-12 w-12 rounded-md border border-line object-cover"
								/>
							) : (
								<span className="flex h-12 w-12 items-center justify-center rounded-md border border-dashed border-line-strong bg-paper-100">
									<SvgIcon name="image" size={16} className="text-ink-muted" />
								</span>
							)}
							<span className="w-full truncate text-center">{preview.label}</span>
						</PlainButton>
					</li>
				);
			})}
		</ul>
	);
}

/**
 * 待处理收件箱（spec §6.2）。“确认继续 / 继续 / 取消 / 重试”只出现在这里。
 */
export function InboxPanel({ items, actions }: { items: InboxItem[]; actions: InboxActions }) {
	const [confirmCancel, setConfirmCancel] = useState(false);
	if (items.length === 0) {
		return (
			<div className="flex min-h-0 flex-1 items-center justify-center px-3 text-center">
				<p className="m-0 text-xs text-ink-muted">没有待处理事项</p>
			</div>
		);
	}

	return (
		<>
			<ul className="m-0 min-h-0 flex-1 list-none space-y-2 overflow-y-auto overscroll-contain p-3" aria-label="待处理">
				{items.map((item) => {
					if (item.kind === "gate") {
						const outline = item.gate?.story_outline;
						return (
							<Card key={item.id} tone="primary" title={item.title} detail={item.detail}>
								{outline ? <OutlinePreviewCard outline={outline} visualBible={item.gate?.visual_bible} /> : null}
								{item.previews && item.previews.length > 0 ? (
									<PreviewStrip previews={item.previews} onFocus={actions.onFocusNode} />
								) : null}
								{/* 长内容滚动时动作留在可见处：只有确认（主）和提意见两件事 */}
								<div className="sticky bottom-0 -mx-3 -mb-3 flex gap-2 rounded-b-lg bg-surface px-3 pb-3 pt-2">
									<Button
										variant="primary"
										size="sm"
										className="flex-1"
										onClick={() => actions.onConfirm()}
										disabled={item.confirmBlocked || actions.gatePending}
										title={item.confirmBlocked ? "修改意见还在处理，新版本出来后再确认" : undefined}
									>
										<SvgIcon name="check" size={14} />
										{item.receipt?.state === "revised" ? "确认新版本" : "确认继续"}
									</Button>
									<Button
										variant="secondary"
										size="sm"
										className="flex-1"
										onClick={actions.onRequestChanges}
										disabled={item.confirmBlocked}
									>
										<SvgIcon name="pencil" size={14} />
										提修改意见
									</Button>
								</div>
							</Card>
						);
					}
					if (item.kind === "recoverable") {
						return (
							<Card key={item.id} tone="warning" title={item.title} detail={item.detail}>
								{item.rawError ? (
									<details className="text-xs text-ink-muted">
										<summary className="cursor-pointer select-none">详细信息</summary>
										<p className="m-0 mt-1 break-words font-mono">{item.rawError}</p>
									</details>
								) : null}
								<div className="flex gap-2">
									{item.resumable ? (
										<Button variant="primary" size="sm" className="flex-1" onClick={actions.onResume}>
											<SvgIcon name="play" size={14} />
											{item.stageName ? `从${item.stageName}继续` : "继续"}
										</Button>
									) : null}
									<Button variant="ghost" size="sm" className="flex-1" onClick={() => setConfirmCancel(true)}>
										<SvgIcon name="x" size={14} />
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
												<SvgIcon name="triangle-alert" size={14} className="shrink-0 text-error-fg" />
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
								<SvgIcon name="refresh-cw" size={14} />
								从失败阶段重试
							</Button>
						</Card>
					);
				})}
			</ul>
			<ConfirmModal
				isOpen={confirmCancel}
				onClose={() => setConfirmCancel(false)}
				onConfirm={() => {
					setConfirmCancel(false);
					actions.onCancel();
				}}
				title="取消这次运行？"
				message="已经生成的内容会保留在画布上，但这次运行不能再接着跑，之后需要重新生成。"
				confirmText="取消运行"
				cancelText="先不取消"
				variant="warning"
			/>
		</>
	);
}
