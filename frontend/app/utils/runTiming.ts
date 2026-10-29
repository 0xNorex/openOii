import type { RunTimingRead } from "~/types";
import { WORKFLOW_STEPS, stepForStage } from "./workflowSteps";

/** 「42 秒」「3 分 12 秒」「1 小时 5 分」：已用时，精确到秒（一小时以上到分） */
export function formatElapsed(seconds: number): string {
	const total = Math.max(0, Math.floor(seconds));
	if (total < 60) return `${total} 秒`;
	const minutes = Math.floor(total / 60);
	if (minutes < 60) return `${minutes} 分 ${total % 60} 秒`;
	return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分`;
}

/** 「约 8 分钟」：估算只给到分钟，向上取整，不显示「约 0 分钟」；没有估算时为 null */
export function formatRemaining(seconds: number | null | undefined): string | null {
	if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return null;
	const minutes = Math.max(1, Math.ceil(seconds / 60));
	if (minutes < 60) return `约 ${minutes} 分钟`;
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return rest ? `约 ${hours} 小时 ${rest} 分钟` : `约 ${hours} 小时`;
}

export interface StepElapsed {
	label: string;
	seconds: number;
	running: boolean;
}

export interface LiveRunTiming {
	/** 整体已用（含等确认） */
	overallSeconds: number;
	/** 当前这一步（六步之一）已经跑了多久；闸门上为 null */
	stepSeconds: number | null;
	stepLabel: string | null;
	/** 剩余估算，随时间往下走，最低留到 1 分钟由 formatRemaining 处理 */
	remainingSeconds: number | null;
	atGate: boolean;
	/** 各步耗时（只列跑过的步） */
	steps: StepElapsed[];
}

/**
 * 服务端快照 + 取数以来过去的时间 → 现在的读数。
 * 不在客户端解析服务端时间戳（避免时区/时钟偏差），只加上本地经过的秒数。
 */
export function liveRunTiming(timing: RunTimingRead, fetchedAtMs: number, nowMs: number): LiveRunTiming {
	const drift = timing.active ? Math.max(0, (nowMs - fetchedAtMs) / 1000) : 0;
	const runningStage = timing.at_gate ? null : timing.stages.find((stage) => stage.status === "running") ?? null;
	const steps: StepElapsed[] = [];
	for (const step of WORKFLOW_STEPS) {
		const stages = timing.stages.filter((stage) => (step.stages as readonly string[]).includes(stage.stage));
		if (stages.length === 0) continue;
		const running = stages.some((stage) => stage === runningStage);
		const seconds = stages.reduce((sum, stage) => sum + stage.elapsed_seconds, 0) + (running ? drift : 0);
		steps.push({ label: step.label, seconds, running });
	}
	const current = steps.find((step) => step.running) ?? null;
	const gateStep = timing.at_gate ? stepForStage(timing.current_stage) : null;
	return {
		overallSeconds: timing.elapsed_seconds + drift,
		stepSeconds: current ? current.seconds : null,
		stepLabel: current?.label ?? gateStep?.label ?? null,
		// 闸门上引擎没在干活：剩余不往下走
		remainingSeconds:
			timing.remaining_seconds === null ? null : Math.max(0, timing.remaining_seconds - (timing.at_gate ? 0 : drift)),
		atGate: timing.at_gate,
		steps,
	};
}
