import {
	AGENT_NAME_MAP,
	type BlockingClip,
	type FeedbackReceipt,
	type RecoveryControlRead,
	type RunAwaitingConfirmEventData,
} from "~/types";
import type { ComicWorkflowSection } from "../graph/types";
import { describeRunError } from "~/utils/runErrors";
import { getWorkflowStageInfo, toSimplifiedStage } from "~/utils/workflowStage";

export type InboxItem =
	| {
			kind: "gate";
			id: string;
			title: string;
			detail: string | null;
			gate: RunAwaitingConfirmEventData | null;
			/** 本闸门上一轮修改意见的回执 */
			receipt?: FeedbackReceipt | null;
			/** 意见还没处理完：先别批准，等新版本 */
			confirmBlocked?: boolean;
		}
	| {
			kind: "recoverable";
			id: "recoverable";
			title: string;
			detail: string;
			resumable: boolean;
			/** 原始错误（英文/技术细节），放在「详细信息」里 */
			rawError?: string | null;
	  }
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
	feedbackReceipt?: FeedbackReceipt | null;
}

/** 每个审批门审的是什么、在画布哪一块：标题写具体产物，画布平移过去。 */
export const GATE_COPY: Record<string, { name: string; section: ComicWorkflowSection | null }> = {
	outline_approval: { name: "故事大纲", section: null },
	characters_approval: { name: "角色设定", section: "elements" },
	shots_approval: { name: "分镜脚本", section: "shotline" },
	character_images_approval: { name: "角色形象图", section: "elements" },
	shot_images_approval: { name: "分镜画面", section: "shotline" },
	compose_approval: { name: "成片", section: "output" },
};

export function gateSection(gate: RunAwaitingConfirmEventData | null | undefined) {
	const stage = gate?.current_stage ?? gate?.stage ?? null;
	return (stage && GATE_COPY[stage]?.section) || null;
}

function stageTitle(stage: string | null | undefined): string | null {
	// 审批门有自己的名字：停在「分镜脚本确认」不能显示成下一步的「渲染阶段」
	if (stage && GATE_COPY[stage]) return `${GATE_COPY[stage].name}确认`;
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
		const gateStage = input.recoveryGate?.current_stage ?? input.recoveryGate?.stage ?? "";
		const name =
			GATE_COPY[gateStage]?.name ||
			(agent && AGENT_NAME_MAP[agent]) ||
			stageTitle(input.recoveryGate?.current_stage) ||
			"当前阶段";
		const receipt = input.feedbackReceipt ?? null;
		const question = input.recoveryGate?.question || input.recoveryGate?.message || null;
		let title = `${name}已完成，等待确认`;
		let detail = question;
		if (receipt?.state === "received" || receipt?.state === "regenerating") {
			title = `已收到修改意见，${name}重做中`;
			detail = "新版本出来后会回到这里等你确认";
		} else if (receipt?.state === "revised") {
			title = `${name}第 ${receipt.round + 1} 版，等待确认`;
			detail = "已按你的意见重做";
		} else if (receipt?.state === "not_applied") {
			title = `${name}没有改动，等待确认`;
			detail = receipt.reason || "这条意见没能用在当前阶段";
		} else if (receipt?.state === "failed") {
			title = `${name}重做失败，保留上一版`;
			detail = receipt.reason || "可以换个说法再提，或直接确认上一版";
		}
		items.push({
			kind: "gate",
			// 每个审批门一个 id，换阶段时重新提醒
			id: `gate:${gateStage || agent || "unknown"}`,
			title,
			detail,
			gate: input.recoveryGate,
			receipt,
			confirmBlocked: receipt?.state === "received" || receipt?.state === "regenerating",
		});
	} else if (input.recoveryControl?.state === "recoverable") {
		const summary = input.recoveryControl.recovery_summary;
		const stage = stageTitle(summary?.current_stage) ?? "上次运行";
		const kept = summary?.preserved_stages?.length ?? 0;
		// 旧后端可能不带 available_actions：缺省时按可继续处理，不能让收件箱崩掉
		const resumable = input.recoveryControl.available_actions?.includes("resume") !== false;
		// 失败和中断是同一件事：一张卡，原因用中文写在里面，原文收进「详细信息」
		const error = describeRunError(input.recoveryControl.active_run?.error);
		const keptText = kept > 0 ? `已保留 ${kept} 个阶段的产物` : null;
		const detail = !resumable
			? [error?.summary, "这次运行无法接着跑，取消后可以重新生成"].filter(Boolean).join("。")
			: error
				? [error.summary, keptText].filter(Boolean).join("。")
				: keptText
					? `${keptText}，可以继续`
					: "可以继续或取消";
		items.push({
			kind: "recoverable",
			id: "recoverable",
			title: `运行中断于${stage}`,
			detail,
			resumable,
			rawError: error?.raw ?? null,
		});
	}

	const clips = input.blockingClips ?? [];
	if (clips.length > 0) {
		items.push({ kind: "blocked", id: "blocked", title: `${clips.length} 个分镜阻塞成片`, clips });
	}

	const recoverable = input.recoveryControl?.state === "recoverable";
	if (
		!input.isGenerating &&
		!input.awaitingConfirm &&
		!recoverable &&
		(status === "failed" || status === "error")
	) {
		items.push({ kind: "failed", id: "failed", title: "最近一次生成失败", detail: "可以从失败阶段重试" });
	}

	return items;
}
