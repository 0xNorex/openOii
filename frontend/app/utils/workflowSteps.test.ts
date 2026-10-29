import { describe, expect, it } from "vitest";
import { STAGE_ORDER } from "~/generated/workflowContract";
import { WORKFLOW_STEPS, formatStep, stepForStage } from "./workflowSteps";

describe("workflow steps", () => {
	it("puts every contract stage into exactly one of six steps, in order", () => {
		expect(WORKFLOW_STEPS).toHaveLength(6);
		const flat = WORKFLOW_STEPS.flatMap((step) => [...step.stages]);
		expect([...flat].sort()).toEqual([...STAGE_ORDER].sort());
		const indices = STAGE_ORDER.map((stage) => stepForStage(stage)?.index ?? -1);
		expect(indices).toEqual([...indices].sort((a, b) => a - b));
	});

	it("names gates by the step they review", () => {
		expect(stepForStage("shot_images_approval")).toEqual({ index: 4, label: "分镜画面", atGate: true });
		expect(stepForStage("critique_character_images")).toEqual({ index: 3, label: "角色形象", atGate: false });
		expect(formatStep(stepForStage("compose_merge")!)).toBe("视频与成片 · 6/6");
	});

	it("ignores simplified or unknown stages", () => {
		expect(stepForStage("plan")).toBeNull();
		expect(stepForStage(undefined)).toBeNull();
	});
});
