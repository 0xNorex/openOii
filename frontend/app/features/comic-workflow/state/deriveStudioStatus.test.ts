import { describe, expect, it } from "vitest";
import type { RecoveryControlRead } from "~/types";
import { deriveStudioStatus } from "./deriveStudioStatus";

function recoveryControl(
	state: RecoveryControlRead["state"],
): RecoveryControlRead {
	return {
		state,
		detail: "run state",
		available_actions: ["resume", "cancel"],
		active_run: {
			id: 9,
			project_id: 15,
			status: state === "active" ? "running" : "failed",
			current_agent: "plan",
			progress: 0.4,
			error: null,
			resource_type: null,
			resource_id: null,
			provider_snapshot: null,
			created_at: "2026-06-14T00:00:00Z",
			updated_at: "2026-06-14T00:00:00Z",
		},
		recovery_summary: {
			project_id: 15,
			run_id: 9,
			current_stage: "plan_outline",
			next_stage: "outline_approval",
			preserved_stages: [],
			stage_history: [],
			resumable: true,
		},
	};
}

const baseInput = {
	isGenerating: false,
	currentRunId: null,
	awaitingConfirm: false,
	recoveryControl: null,
	projectStatus: "draft",
	projectVideoUrl: null,
	blockingClips: [],
};

describe("deriveStudioStatus", () => {
	it("prioritizes confirmation over active generation", () => {
		expect(
			deriveStudioStatus({
				...baseInput,
				isGenerating: true,
				currentRunId: 11,
				awaitingConfirm: true,
			}).state,
		).toBe("awaitingConfirm");
	});

	it("marks resumable conflicts as recoverable", () => {
		expect(
			deriveStudioStatus({
				...baseInput,
				recoveryControl: recoveryControl("recoverable"),
				currentRunId: 9,
			}).state,
		).toBe("recoverable");
	});

	it("keeps active runs in the generating state", () => {
		expect(
			deriveStudioStatus({
				...baseInput,
				recoveryControl: recoveryControl("active"),
			}).state,
		).toBe("generating");
	});

	it("exposes cancelled as a terminal run state", () => {
		expect(
			deriveStudioStatus({
				...baseInput,
				lastRunStatus: "cancelled",
			}).state,
		).toBe("cancelled");
	});

	it("distinguishes blocked, superseded, ready, and idle artifact states", () => {
		expect(
			deriveStudioStatus({
				...baseInput,
				blockingClips: [
					{ shot_id: 1, order: 1, status: "missing", reason: "missing_video" },
				],
			}).state,
		).toBe("blocked");

		expect(
			deriveStudioStatus({
				...baseInput,
				projectStatus: "superseded",
				projectVideoUrl: "/static/final.mp4",
			}).state,
		).toBe("superseded");

		expect(
			deriveStudioStatus({
				...baseInput,
				projectStatus: "ready",
				projectVideoUrl: "/static/final.mp4",
			}).state,
		).toBe("ready");

		expect(deriveStudioStatus(baseInput).state).toBe("idle");
	});

	it("drops stale progress and stage once the run is no longer active", () => {
		const status = deriveStudioStatus({
			...baseInput,
			projectStatus: "ready",
			projectVideoUrl: "/static/final.mp4",
			currentStage: "plan",
			progress: 0.08,
		});
		expect(status).toMatchObject({
			state: "ready",
			tone: "success",
			stage: null,
			progress: null,
			pendingCount: 0,
		});
	});

	it("reports stage and progress only while generating", () => {
		expect(
			deriveStudioStatus({
				...baseInput,
				isGenerating: true,
				currentStage: "render",
				progress: 0.5,
			}),
		).toMatchObject({ state: "generating", tone: "info", stage: "render", progress: 0.5 });

		expect(
			deriveStudioStatus({
				...baseInput,
				isGenerating: true,
				awaitingConfirm: true,
				currentStage: "plan_approval",
				progress: 0.3,
			}),
		).toMatchObject({
			state: "awaitingConfirm",
			label: "待确认",
			tone: "warning",
			stage: "plan_approval",
			progress: null,
			pendingCount: 1,
		});
	});

	it("ranks a finished cut above a cancelled last run", () => {
		expect(
			deriveStudioStatus({
				...baseInput,
				lastRunStatus: "cancelled",
				projectStatus: "ready",
				projectVideoUrl: "/static/final.mp4",
			}).state,
		).toBe("ready");
	});

	it("ranks failure above blockers", () => {
		expect(
			deriveStudioStatus({
				...baseInput,
				projectStatus: "failed",
				blockingClips: [
					{ shot_id: 1, order: 1, status: "missing", reason: "missing_video" },
				],
			}).state,
		).toBe("failed");
	});
});
