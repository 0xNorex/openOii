import { SvgIcon, type IconName } from "~/components/ui/SvgIcon";
import type { WorkflowNodeStatus } from "../graph/types";

/**
 * 卡片状态徽标：颜色 + 形状两路信号。
 * 色盲模拟下「需重合成 / 失败」（红绿色弱）、「生成中 / 完成」（蓝黄色弱）色相会靠近，
 * 所以每个状态还带各自的图形：脉冲点、对勾、警示、刷新……不靠颜色也分得开。
 */
export interface NodeStatusCopy {
	label: string;
	/** 底色 + 文字色（Tailwind 字面量，供构建扫描） */
	cls: string;
	/** 形状：null 用实心点；generating 的点会脉冲 */
	icon: IconName | null;
}

export const NODE_STATUS: Record<WorkflowNodeStatus, NodeStatusCopy> = {
	draft: { label: "待生成", cls: "bg-paper-200 text-ink-muted", icon: null },
	generating: { label: "生成中", cls: "bg-info-bg text-info-fg", icon: null },
	// 审查只是在看：中性色，不催用户
	reviewing: { label: "审查中", cls: "bg-paper-200 text-ink", icon: "eye" },
	// 待确认是要你动手的事：用品牌色，和「生成中」（信息色）、「需重合成」（警告色）分开
	review: { label: "待确认", cls: "bg-primary/10 text-primary", icon: "approve-gate" },
	unconfirmed: { label: "未确认", cls: "bg-paper-200 text-ink-muted", icon: null },
	approved: { label: "已批准", cls: "bg-success-bg text-success-fg", icon: "check" },
	blocked: { label: "阻塞", cls: "bg-error-bg text-error-fg", icon: "warning-circle" },
	superseded: { label: "需重合成", cls: "bg-warning-bg text-warning-fg", icon: "refresh-cw" },
	ready: { label: "可用", cls: "bg-success-bg text-success-fg", icon: "check" },
};

/** 卡片、Inspector 共用的状态词：同一张卡在两处叫法一致 */
export function nodeStatusLabel(status: WorkflowNodeStatus): string {
	return NODE_STATUS[status].label;
}

export function NodeStatusBadge({ status, label }: { status: WorkflowNodeStatus; label?: string }) {
	const copy = NODE_STATUS[status] ?? NODE_STATUS.draft;
	return (
		<span
			className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-line px-2 py-0.5 text-xs font-medium ${copy.cls}`}
			data-node-status={status}
		>
			{copy.icon ? (
				<SvgIcon name={copy.icon} size={12} className="shrink-0" />
			) : (
				<span
					className={`h-2 w-2 shrink-0 rounded-full bg-current ${status === "generating" ? "animate-pulse motion-reduce:animate-none" : "opacity-60"}`}
				/>
			)}
			{label ?? copy.label}
		</span>
	);
}
