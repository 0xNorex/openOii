import {
	AGENT_NAME_MAP,
	type BlockingClip,
	type RecoveryControlRead,
	type RunAwaitingConfirmEventData,
} from "~/types";
import { getWorkflowStageInfo, toSimplifiedStage } from "~/utils/workflowStage";

export type InboxItem =
	| { kind: "gate"; id: string; title: string; detail: string | null; gate: RunAwaitingConfirmEventData | null }
	| { kind: "recoverable"; id: "recoverable"; title: string; detail: string; resumable: boolean }
	| { kind: "blocked"; id: "blocked"; title: string; clips: BlockingClip[] }
	| { kind: "failed"; id: "failed"; title: string; detail: string };

export interface DeriveInboxInput {
	awaitingConfirm: boolean;
	awaitingAgent: string | null;
	recoveryGate: RunAwaitingConfirmEventData | null;
	recoveryControl: RecoveryControlRead | null;
	isGenerating: boolean;
	projectStatus?: string | null;
	blockingClips?: BlockingClip[] | null;
}

function stageTitle(stage: string | null | undefined): string | null {
	const simplified = toSimplifiedStage(stage);
	return simplified ? getWorkflowStageInfo(simplified).title : null;
}

/**
 * 待处理收件箱（spec §6.2）：审批门、可恢复运行、阻塞、失败。
 * 审批门存在时不再列“可恢复”——确认就是继续。
 */
export function deriveInboxItems(input: DeriveInboxInput): InboxItem[] {
	const items: InboxItem[] = [];
	const status = input.projectStatus?.trim().toLowerCase() ?? null;

	if (input.awaitingConfirm) {
		const agent = input.awaitingAgent ?? input.recoveryGate?.agent ?? null;
		const name = (agent && AGENT_NAME_MAP[agent]) || stageTitle(input.recoveryGate?.current_stage) || "当前阶段";
		items.push({
			kind: "gate",
			// 每个审批门一个 id，换阶段时重新提醒
			id: `gate:${agent ?? "unknown"}`,
			title: `${name}已完成，等待确认`,
			detail: input.recoveryGate?.question || input.recoveryGate?.message || null,
			gate: input.recoveryGate,
		});
	} else if (input.recoveryControl?.state === "recoverable") {
		const summary = input.recoveryControl.recovery_summary;
		const stage = stageTitle(summary?.current_stage) ?? "上次运行";
		const kept = summary?.preserved_stages?.length ?? 0;
		// 旧后端可能不带 available_actions：缺省时按可继续处理，不能让收件箱崩掉
		const resumable = input.recoveryControl.available_actions?.includes("resume") !== false;
		items.push({
			kind: "recoverable",
			id: "recoverable",
			title: `运行中断于${stage}`,
			detail: !resumable
				? "这次运行无法接着跑，取消后可以重新生成"
				: kept > 0
					? `已保留 ${kept} 个阶段的产物，可以继续`
					: "可以继续或取消",
			resumable,
		});
	}

	const clips = input.blockingClips ?? [];
	if (clips.length > 0) {
		items.push({ kind: "blocked", id: "blocked", title: `${clips.length} 个分镜阻塞成片`, clips });
	}

	if (!input.isGenerating && !input.awaitingConfirm && (status === "failed" || status === "error")) {
		items.push({ kind: "failed", id: "failed", title: "最近一次生成失败", detail: "可以从失败阶段重试" });
	}

	return items;
}
