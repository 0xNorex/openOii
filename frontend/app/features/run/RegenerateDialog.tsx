import { useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "~/components/ui/Button";
import { Dialog } from "~/components/ui/Dialog";
import { SvgIcon } from "~/components/ui/SvgIcon";
import { projectQueryKeys } from "~/query/queryKeys";
import { projectsApi } from "~/services/api";
import type { RegeneratePlanRead } from "~/types";

function formatDuration(seconds: number): string {
	if (seconds < 90) return `${Math.max(10, Math.round(seconds / 10) * 10)} 秒`;
	return `${Math.round(seconds / 60)} 分钟`;
}

/** 「约 3–8 分钟」；两端单位相同只写一次。 */
export function formatEstimate(plan: RegeneratePlanRead): string {
	const low = formatDuration(plan.estimate.seconds_low);
	const high = formatDuration(plan.estimate.seconds_high);
	const [lowNum, lowUnit] = low.split(" ");
	const [highNum, highUnit] = high.split(" ");
	return lowUnit === highUnit ? `约 ${lowNum}–${highNum} ${highUnit}` : `约 ${low}–${high}`;
}

export function formatCalls(plan: RegeneratePlanRead): string {
	const { text_calls, image_calls, video_calls } = plan.estimate;
	return `约 ${text_calls} 次文本、${image_calls} 次图片、${video_calls} 次视频调用`;
}

interface RegenerateDialogProps {
	open: boolean;
	projectId: number;
	onClose: () => void;
	onConfirm: () => void;
	pending?: boolean;
}

/**
 * 重新生成前先说清楚：重做哪些、大概多久和多少调用、当前成片怎么保留。
 * 打开时顺便预热模型探测，确认后的创建不再等它。
 */
export function RegenerateDialog({ open, projectId, onClose, onConfirm, pending = false }: RegenerateDialogProps) {
	const titleId = useId();
	const { data: plan, isLoading } = useQuery({
		queryKey: projectQueryKeys.regeneratePlan(projectId),
		queryFn: () => projectsApi.getRegeneratePlan(projectId, true),
		enabled: open,
		staleTime: 0,
	});

	return (
		<Dialog
			open={open}
			onClose={onClose}
			dismissible={!pending}
			labelledBy={titleId}
			className="w-full max-w-md p-4"
		>
			<div data-testid="regenerate-dialog">
				<h3 id={titleId} className="m-0 text-md font-bold">
					重新生成整个项目？
				</h3>
				{isLoading || !plan ? (
					<p className="m-0 mt-2 text-sm text-ink-muted">正在估算…</p>
				) : (
					<div className="mt-2 space-y-2 text-sm">
						<p className="m-0">
							会按顺序重做：<span className="text-ink-muted">{plan.stages.join(" → ")}</span>
						</p>
						<p className="m-0 tabular-nums">
							<SvgIcon name="clock-3" size={14} className="mr-1 inline-block align-middle" />
							{formatEstimate(plan)}
							<span className="text-ink-muted">
								{plan.estimate.basis === "history" ? "（按上次耗时估算）" : "（粗略估算）"}
							</span>
						</p>
						<p className="m-0 text-ink-muted">{formatCalls(plan)}，按模型服务计费</p>
						{plan.has_content ? (
							<p className="m-0 rounded-md border border-line bg-paper-100 p-2 text-ink" data-testid="regenerate-keeps-previous">
								当前{plan.has_final_video ? "成片和" : ""}画布（{plan.character_count} 个角色、{plan.shot_count} 个分镜）会保留为上一版：
								中途停止会自动放回，完成后也能在 ··· 菜单里恢复上一版。
							</p>
						) : null}
					</div>
				)}
				<div className="dialog-actions">
					<Button variant="ghost" size="sm" onClick={onClose} disabled={pending}>
						取消
					</Button>
					<Button variant="primary" size="sm" onClick={onConfirm} disabled={pending || !plan} aria-busy={pending}>
						{pending ? <span className="spinner-doodle h-3.5 w-3.5" aria-hidden="true" /> : <SvgIcon name="sparks" size={14} />}
						{pending ? "正在创建…" : "重新生成"}
					</Button>
				</div>
			</div>
		</Dialog>
	);
}
