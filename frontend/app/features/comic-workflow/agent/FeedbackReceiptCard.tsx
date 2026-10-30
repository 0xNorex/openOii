import { clsx } from "clsx";
import type { FeedbackReceipt } from "~/types";
import { SvgIcon } from "~/components/ui/SvgIcon";
import { GATE_COPY } from "./inboxItems";
import "~/components/ui/icons/workbenchIcons";

type StepState = "done" | "current" | "todo" | "error";

/** 回执的三步：已收到 → 重做中 → 结果（新版本待确认 / 未采纳 / 失败）。 */
export function receiptSteps(receipt: FeedbackReceipt): Array<{ label: string; state: StepState }> {
	const name = (receipt.gate && GATE_COPY[receipt.gate]?.name) || "本阶段";
	const outcome =
		receipt.state === "not_applied"
			? { label: "未采纳", state: "error" as const }
			: receipt.state === "failed"
				? { label: "重做失败", state: "error" as const }
				: receipt.state === "revised"
					? { label: `第 ${receipt.round + 1} 版待确认`, state: "current" as const }
					: { label: `${name}新版本`, state: "todo" as const };
	const redo: StepState =
		receipt.state === "received"
			? "todo"
			: receipt.state === "regenerating"
				? "current"
				: receipt.state === "not_applied"
					? "todo"
					: "done";
	return [
		{ label: "已收到", state: receipt.state === "received" ? "current" : "done" },
		{ label: "重做中", state: redo },
		outcome,
	];
}

export function receiptHeadline(receipt: FeedbackReceipt): string {
	const name = (receipt.gate && GATE_COPY[receipt.gate]?.name) || "本阶段";
	switch (receipt.state) {
		case "received":
			return `已收到，准备按意见重做${name}`;
		case "regenerating":
			return `正在按意见重做${name}`;
		case "revised":
			return `${name}已按意见重做，等你确认`;
		case "not_applied":
			return `这条意见没有用在${name}上`;
		case "failed":
			return `重做没有成功，保留了上一版${name}`;
	}
}

/**
 * 闸门修改意见回执（活动时间线里的一张卡）。
 * 色调：群青浅底 + 整圈细边，不用侧边色条（DESIGN.md）。
 */
export function FeedbackReceiptCard({ receipt }: { receipt: FeedbackReceipt }) {
	const problem = receipt.state === "not_applied" || receipt.state === "failed";
	const busy = receipt.state === "received" || receipt.state === "regenerating";
	return (
		<div
			className={clsx(
				"rounded-lg border p-2",
				problem ? "border-warning/50 bg-warning/5" : "border-primary/30 bg-primary/5",
			)}
			data-testid="feedback-receipt"
			data-state={receipt.state}
			role="status"
			aria-live="polite"
		>
			<div className="flex items-center gap-1.5">
				<SvgIcon
					name={busy ? "refresh-cw" : "chat-bubble-check"}
					size={14}
					className={clsx("shrink-0", problem ? "text-warning-fg" : "text-primary", busy && "animate-pulse")}
				/>
				<span className="min-w-0 flex-1 truncate text-xs font-semibold">
					修改意见 · 第 {receipt.round} 轮
				</span>
			</div>
			{receipt.content ? (
				<p className="m-0 mt-1 line-clamp-3 select-text whitespace-pre-wrap break-words text-sm text-ink">
					“{receipt.content}”
				</p>
			) : null}
			<p className={clsx("m-0 mt-1 text-xs", problem ? "text-warning-fg" : "text-ink-muted")}>
				{receiptHeadline(receipt)}
				{receipt.reason ? `：${receipt.reason}` : null}
			</p>
			<ol className="m-0 mt-1.5 flex list-none items-center gap-1 p-0" aria-label="处理进度">
				{receiptSteps(receipt).map((step, index) => (
					<li key={step.label} className="flex min-w-0 items-center gap-1 text-xs">
						{index > 0 ? <span className="h-px w-3 shrink-0 bg-ink/20" aria-hidden="true" /> : null}
						<span
							className={clsx(
								"truncate rounded-full border px-1.5",
								step.state === "done" && "border-primary/30 text-primary",
								step.state === "current" && "border-primary bg-primary text-primary-content",
								step.state === "todo" && "border-line text-ink-muted",
								step.state === "error" && "border-warning/50 text-warning-fg",
							)}
							data-step={step.state}
						>
							{step.label}
						</span>
					</li>
				))}
			</ol>
		</div>
	);
}
