import { describe, expect, it } from "vitest";
import type { RunTimingRead } from "~/types";
import { formatElapsed, formatRemaining, liveRunTiming } from "./runTiming";

const base: RunTimingRead = {
	run_id: 1,
	status: "running",
	active: true,
	started_at: "2026-10-29T15:00:00Z",
	elapsed_seconds: 600,
	current_stage: "render_characters",
	at_gate: false,
	stages: [
		{ stage: "plan_outline", status: "succeeded", attempts: 1, elapsed_seconds: 70, estimate_seconds: 60 },
		{ stage: "plan_characters", status: "succeeded", attempts: 1, elapsed_seconds: 65, estimate_seconds: 60 },
		{ stage: "render_characters", status: "running", attempts: 2, elapsed_seconds: 40, estimate_seconds: 180 },
	],
	remaining_seconds: 500,
	estimate_basis: "history",
};

describe("run timing formatting", () => {
	it("formats elapsed to the second and remaining to the minute with 约", () => {
		expect(formatElapsed(42.9)).toBe("42 秒");
		expect(formatElapsed(192)).toBe("3 分 12 秒");
		expect(formatElapsed(3900)).toBe("1 小时 5 分");
		expect(formatRemaining(20)).toBe("约 1 分钟");
		expect(formatRemaining(481)).toBe("约 9 分钟");
		expect(formatRemaining(3600)).toBe("约 1 小时");
		expect(formatRemaining(4500)).toBe("约 1 小时 15 分钟");
	});

	it("degrades to no estimate when there is no history", () => {
		expect(formatRemaining(null)).toBeNull();
		expect(formatRemaining(undefined)).toBeNull();
	});
});

describe("liveRunTiming", () => {
	it("advances the running step, the total and the remaining by the local time since the fetch", () => {
		const live = liveRunTiming(base, 1_000, 11_000);
		expect(live.overallSeconds).toBe(610);
		expect(live.stepLabel).toBe("角色形象");
		expect(live.stepSeconds).toBe(50);
		expect(live.remainingSeconds).toBe(490);
		expect(live.steps.map((step) => [step.label, step.seconds])).toEqual([
			["故事大纲", 70],
			["角色设定", 65],
			["角色形象", 50],
		]);
	});

	it("at a gate: no step clock, the estimate holds still, the total keeps going", () => {
		const gate = {
			...base,
			at_gate: true,
			current_stage: "characters_approval",
			stages: base.stages.slice(0, 2),
		};
		const live = liveRunTiming(gate, 0, 30_000);
		expect(live.atGate).toBe(true);
		expect(live.stepSeconds).toBeNull();
		expect(live.stepLabel).toBe("角色设定");
		expect(live.remainingSeconds).toBe(500);
		expect(live.overallSeconds).toBe(630);
	});

	it("a finished run does not tick", () => {
		const done = { ...base, active: false, status: "succeeded", remaining_seconds: null };
		const live = liveRunTiming(done, 0, 60_000);
		expect(live.overallSeconds).toBe(600);
		expect(live.remainingSeconds).toBeNull();
	});
});
