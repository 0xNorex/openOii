import { STAGE_ORDER, type StageId } from "~/generated/workflowContract";

/**
 * 对外只有一套步骤名（UX 复盘 P1-7）：状态胶囊、PromptBar chip、审批卡、活动面板
 * 都从这里取，不再出现「规划 / 渲染 / 合成」和「大纲 · 待确认」混用。
 * 细粒度阶段（contracts/workflow.json）归到 6 步里；审查阶段算在它审的那一步。
 */
export const WORKFLOW_STEPS = [
	{ key: "outline", label: "故事大纲", stages: ["plan_outline", "outline_approval"] },
	{ key: "characters", label: "角色设定", stages: ["plan_characters", "characters_approval"] },
	{ key: "shots", label: "分镜脚本", stages: ["plan_shots", "shots_approval"] },
	{
		key: "character_images",
		label: "角色形象",
		stages: ["render_characters", "character_images_approval", "critique_character_images"],
	},
	{ key: "shot_images", label: "分镜画面", stages: ["render_shots", "shot_images_approval", "critique_shot_images"] },
	{ key: "compose", label: "视频与成片", stages: ["compose_videos", "compose_merge", "compose_approval"] },
] as const satisfies ReadonlyArray<{ key: string; label: string; stages: readonly StageId[] }>;

export const WORKFLOW_STEP_COUNT = WORKFLOW_STEPS.length;

export interface WorkflowStep {
	/** 0 起 */
	index: number;
	label: string;
	/** 停在这一步的审批门上 */
	atGate: boolean;
}

export function isStageId(value: unknown): value is StageId {
	return typeof value === "string" && (STAGE_ORDER as readonly string[]).includes(value);
}

/** 细粒度阶段 → 第几步、叫什么；不认识的阶段返回 null（调用方不显示步骤）。 */
export function stepForStage(stage: unknown): WorkflowStep | null {
	if (!isStageId(stage)) return null;
	const index = WORKFLOW_STEPS.findIndex((step) => (step.stages as readonly string[]).includes(stage));
	if (index < 0) return null;
	return { index, label: WORKFLOW_STEPS[index].label, atGate: stage.endsWith("_approval") };
}

/** 「分镜画面 · 5/6」 */
export function formatStep(step: WorkflowStep): string {
	return `${step.label} · ${step.index + 1}/${WORKFLOW_STEP_COUNT}`;
}
