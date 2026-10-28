import type { BlockingClip, RecoveryControlRead, WorkflowStage } from "~/types";

/**
 * 工作台状态的唯一真相（spec §6.1）。状态文案、色调、阶段高亮和进度条
 * 都只从这里取值；运行不活跃时 stage / progress 一律为 null。
 */

export type StudioStatusState =
	| "idle"
	| "generating"
	| "awaitingConfirm"
	| "recoverable"
	| "cancelled"
	| "ready"
	| "superseded"
	| "failed"
	| "blocked";

export type LastRunTerminalStatus = "cancelled" | null;

export type StudioStatusTone = "neutral" | "info" | "warning" | "success" | "error";

export interface StudioStatus {
	state: StudioStatusState;
	label: string;
	description: string;
	tone: StudioStatusTone;
	/** 仅 generating / awaitingConfirm / recoverable 时有值 */
	stage: WorkflowStage | null;
	/** 仅 generating 时有值（0–1） */
	progress: number | null;
	/** 待处理（审批 / 恢复）条目数 */
	pendingCount: number;
}

export interface DeriveStudioStatusInput {
	isGenerating: boolean;
	currentRunId: number | null;
	awaitingConfirm: boolean;
	recoveryControl: RecoveryControlRead | null;
	projectStatus?: string | null;
	projectVideoUrl?: string | null;
	blockingClips?: BlockingClip[] | null;
	lastRunStatus?: LastRunTerminalStatus;
	currentStage?: WorkflowStage | null;
	progress?: number | null;
}

const STUDIO_STATUS_COPY: Record<
	StudioStatusState,
	Pick<StudioStatus, "label" | "description" | "tone">
> = {
	idle: {
		label: "待启动",
		description: "项目画布已准备好，可以开始生成",
		tone: "neutral",
	},
	generating: {
		label: "生成中",
		description: "AI 正在推进当前生成运行",
		tone: "info",
	},
	awaitingConfirm: {
		label: "待确认",
		description: "正在等待创作者确认后继续",
		tone: "warning",
	},
	recoverable: {
		label: "可恢复",
		description: "存在可恢复的运行，可以继续或取消",
		tone: "warning",
	},
	cancelled: {
		label: "已取消",
		description: "最近一次运行已取消",
		tone: "neutral",
	},
	ready: {
		label: "成片可用",
		description: "最终成片已生成，可以预览或导出",
		tone: "success",
	},
	superseded: {
		label: "需重合成",
		description: "画布内容已更新，当前成片需要重新合成",
		tone: "warning",
	},
	failed: {
		label: "生成失败",
		description: "最近一次生成失败，可从失败阶段重试",
		tone: "error",
	},
	blocked: {
		label: "阻塞",
		description: "当前内容存在阻塞项，需要处理后继续",
		tone: "error",
	},
};

/** 只按状态取文案与色调；stage / progress 为空。用于无运行信息的场景和测试。 */
export function getStudioStatusMeta(state: StudioStatusState): StudioStatus {
	return {
		state,
		...STUDIO_STATUS_COPY[state],
		stage: null,
		progress: null,
		pendingCount: state === "awaitingConfirm" || state === "recoverable" ? 1 : 0,
	};
}

const ACTIVE_STATES: ReadonlySet<StudioStatusState> = new Set([
	"generating",
	"awaitingConfirm",
	"recoverable",
]);

export function deriveStudioStatus(input: DeriveStudioStatusInput): StudioStatus {
	const meta = getStudioStatusMeta(deriveState(input));
	if (!ACTIVE_STATES.has(meta.state)) return meta;
	return {
		...meta,
		stage: input.currentStage ?? null,
		progress:
			meta.state === "generating"
				? Math.max(0, Math.min(1, input.progress ?? 0))
				: null,
	};
}

// 优先级见 spec §6.1：awaitingConfirm > recoverable > generating > failed >
// blocked > superseded > ready > cancelled > idle。
function deriveState(input: DeriveStudioStatusInput): StudioStatusState {
	const projectStatus = input.projectStatus?.trim().toLowerCase() ?? null;
	const hasBlockingClips = Boolean(input.blockingClips?.length);

	if (input.awaitingConfirm) {
		return "awaitingConfirm";
	}

	if (input.recoveryControl?.state === "recoverable") {
		return "recoverable";
	}

	if (
		input.recoveryControl?.state === "active" ||
		input.isGenerating ||
		Boolean(input.currentRunId)
	) {
		return "generating";
	}

	// failed 是独立终态：列表页显示「生成失败」，工作台不能把它降级成「阻塞」
	if (projectStatus === "failed" || projectStatus === "error") {
		return "failed";
	}

	if (hasBlockingClips || projectStatus === "blocked") {
		return "blocked";
	}

	if (projectStatus === "superseded") {
		return "superseded";
	}

	if (
		Boolean(input.projectVideoUrl) ||
		projectStatus === "ready" ||
		projectStatus === "completed"
	) {
		return "ready";
	}

	if (input.lastRunStatus === "cancelled" || projectStatus === "cancelled") {
		return "cancelled";
	}

	return "idle";
}

const TONE_DOT: Record<StudioStatusTone, string> = {
	neutral: "bg-ink/35",
	info: "bg-info",
	warning: "bg-warning",
	success: "bg-success",
	error: "bg-error",
};

/** 状态点颜色只由 tone 决定；生成中额外脉冲（减少动态效果时不脉冲）。 */
export function studioStatusDotClass(status: Pick<StudioStatus, "state" | "tone">): string {
	const dot = TONE_DOT[status.tone];
	return status.state === "generating" ? `${dot} motion-safe:animate-pulse` : dot;
}
