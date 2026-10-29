import type {
  FeedbackReceipt,
  ProjectProviderSettings,
  RecoveryControlRead,
  RecoverySummaryRead,
  RunAwaitingConfirmEventData,
  WorkflowStage,
} from "~/types";
import type { LiveStream } from "~/features/comic-workflow/agent/liveStream";
import { toSimplifiedStage } from "~/utils/workflowStage";
import { appQueryClient } from "./client";
import { projectQueryKeys } from "./queryKeys";

/**
 * Live run UI state lives in the query cache, not in Zustand.
 *
 * This is a projection of the durable event stream (run_started / run_progress
 * / run_awaiting_confirm / run_*), i.e. server-owned state. Keeping it in the UI
 * store made it a second home for the same data and forced every websocket
 * event to be written twice.
 */
export interface RunState {
	/** Local projection revision; prevents slow HTTP hydration from replacing newer WS state. */
	revision: number;
	isGenerating: boolean;
  currentStage: WorkflowStage;
  currentAgent: string | null;
  progress: number;
  currentRunId: number | null;
  currentRunProviderSnapshot: ProjectProviderSettings | null;
  awaitingConfirm: boolean;
  awaitingAgent: string | null;
  recoveryControl: RecoveryControlRead | null;
  recoverySummary: RecoverySummaryRead | null;
  recoveryGate: RunAwaitingConfirmEventData | null;
  /** LLM call in flight (llm_stream), or the one that just failed. */
  liveStream: LiveStream | null;
  /** 当前闸门上最近一次「要求修改」的回执；批准或换闸门后清空。 */
  feedbackReceipt: FeedbackReceipt | null;
  /** 最近一次用服务端 runs/current 校准的时间（ms）；null = 还没校准过。 */
  syncedAt: number | null;
}

export const INITIAL_RUN_STATE: RunState = {
	revision: 0,
	isGenerating: false,
  currentStage: "plan",
  currentAgent: null,
  progress: 0,
  currentRunId: null,
  currentRunProviderSnapshot: null,
  awaitingConfirm: false,
  awaitingAgent: null,
  recoveryControl: null,
  recoverySummary: null,
  recoveryGate: null,
  liveStream: null,
  feedbackReceipt: null,
  syncedAt: null,
};

export function readRunState(projectId: number): RunState {
  return (
    appQueryClient.getQueryData<RunState>(projectQueryKeys.runState(projectId)) ??
    INITIAL_RUN_STATE
  );
}

/** Shallow-merge a patch; a no-op patch keeps the previous object identity. */
export function patchRunState(projectId: number, patch: Partial<RunState>): void {
  const current = readRunState(projectId);
  let changed = false;
  for (const key of Object.keys(patch) as Array<keyof RunState>) {
    if (patch[key] !== undefined && patch[key] !== current[key]) {
      changed = true;
      break;
    }
  }
  if (!changed) return;
  appQueryClient.setQueryData<RunState>(projectQueryKeys.runState(projectId), {
    ...current,
    ...patch,
    revision: current.revision + 1,
  });
}

export function resetRunState(projectId: number): void {
	const current = readRunState(projectId);
	appQueryClient.setQueryData<RunState>(projectQueryKeys.runState(projectId), {
		...INITIAL_RUN_STATE,
		syncedAt: current.syncedAt,
		revision: current.revision + 1,
	});
}

/** 闸门载荷里的上一轮结果 → 回执。 */
export function receiptFromGate(gate: RunAwaitingConfirmEventData | null | undefined): FeedbackReceipt | null {
	const outcome = gate?.feedback;
	if (!outcome) return null;
	return {
		id: outcome.id || `round-${outcome.round}`,
		round: outcome.round,
		state: outcome.state,
		content: outcome.content ?? "",
		reason: outcome.reason ?? null,
		gate: gate?.current_stage ?? gate?.stage ?? null,
		entityType: outcome.entity_type ?? null,
		entityIds: outcome.entity_ids ?? null,
	};
}

/**
 * 用服务端 runs/current 重建运行态（纯函数）。服务端是真相：
 * - 没有活跃/可恢复运行 → 清掉生成中、待确认、可恢复；
 * - recoverable → 只留可恢复（不是“生成中”）；
 * - active → 生成中；停在闸门（waiting_for_approval）时恢复待确认与闸门载荷；
 * - 已提交但还没处理完的修改意见 → 回执“已收到 / 重做中”。
 */
export function reconcileRunState(
	live: RunState,
	control: RecoveryControlRead | null,
	now: number = Date.now(),
): RunState {
	if (!control) {
		return {
			...live,
			isGenerating: false,
			currentRunId: null,
			currentAgent: null,
			awaitingConfirm: false,
			awaitingAgent: null,
			recoveryControl: null,
			recoveryGate: null,
			feedbackReceipt: null,
			// 刚失败的那次调用留在屏幕上，其余的流随运行一起结束
			liveStream: live.liveStream?.status === "error" ? live.liveStream : null,
			syncedAt: now,
		};
	}

	const run = control.active_run;
	const summary = control.recovery_summary;
	const base = {
		...live,
		recoveryControl: control,
		recoverySummary: summary,
		syncedAt: now,
	};
	const stageFromSummary = summary
		? toSimplifiedStage(summary.next_stage ?? summary.current_stage)
		: null;

	if (control.state === "recoverable") {
		return {
			...base,
			...(stageFromSummary ? { currentStage: stageFromSummary } : {}),
			isGenerating: false,
			currentRunId: null,
			currentAgent: null,
			awaitingConfirm: false,
			awaitingAgent: null,
			recoveryGate: null,
			feedbackReceipt: null,
			liveStream: live.liveStream?.status === "error" ? live.liveStream : null,
		};
	}

	const atGate = run.status === "waiting_for_approval";
	const gate = atGate
		? (control.awaiting_gate ??
			(live.recoveryGate?.run_id === run.id ? live.recoveryGate : null))
		: null;
	const gateStage = gate ? toSimplifiedStage(gate.current_stage ?? gate.stage) : null;
	const sameRun = live.currentRunId === run.id;

	let receipt: FeedbackReceipt | null = receiptFromGate(gate);
	const pending = control.pending_gate_feedback;
	if (pending) {
		receipt = {
			id: pending.id,
			round: (gate?.feedback?.round ?? (live.feedbackReceipt?.id === pending.id ? live.feedbackReceipt.round - 1 : 0)) + 1,
			state: atGate ? "received" : "regenerating",
			content: pending.content,
			reason: null,
			gate: gate?.current_stage ?? live.feedbackReceipt?.gate ?? null,
			entityType: pending.entity_type ?? null,
			entityIds: pending.entity_ids ?? null,
		};
	}

	return {
		...base,
		...(gateStage ? { currentStage: gateStage } : stageFromSummary && !sameRun ? { currentStage: stageFromSummary } : {}),
		isGenerating: true,
		currentRunId: run.id,
		currentAgent: run.current_agent ?? live.currentAgent,
		// 进度只往前走：WS 帧可能比数据库新
		progress: sameRun ? Math.max(live.progress, run.progress ?? 0) : (run.progress ?? 0),
		currentRunProviderSnapshot: run.provider_snapshot ?? live.currentRunProviderSnapshot,
		awaitingConfirm: atGate,
		awaitingAgent: atGate ? (gate?.agent ?? run.current_agent ?? null) : null,
		recoveryGate: gate,
		feedbackReceipt: receipt,
		liveStream: atGate ? null : sameRun ? live.liveStream : null,
	};
}
