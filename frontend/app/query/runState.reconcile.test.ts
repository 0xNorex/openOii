import { describe, expect, it } from "vitest";
import type { RecoveryControlRead, RunAwaitingConfirmEventData } from "~/types";
import { INITIAL_RUN_STATE, reconcileRunState, receiptFromGate, type RunState } from "./runState";

const summary = {
	current_stage: "outline_approval",
	next_stage: "plan_characters",
	preserved_stages: [],
	stages: [],
	reusable_artifacts: [],
	invalidated_artifacts: [],
	blocked_by: [],
} as unknown as RecoveryControlRead["recovery_summary"];

const gate = {
	run_id: 7,
	agent: "outline",
	current_stage: "outline_approval",
	stage: "outline_approval",
	message: "大纲已完成",
	recovery_summary: summary,
} as unknown as RunAwaitingConfirmEventData;

function control(patch: Partial<RecoveryControlRead> & { status?: string; error?: string | null } = {}): RecoveryControlRead {
	const { status = "waiting_for_approval", error = null, ...rest } = patch;
	return {
		state: "active",
		detail: "",
		available_actions: ["cancel"],
		active_run: {
			id: 7,
			project_id: 1,
			status,
			current_agent: "outline",
			progress: 0.2,
			error,
			resource_type: null,
			resource_id: null,
			created_at: "",
			updated_at: "",
		},
		recovery_summary: summary,
		awaiting_gate: status === "waiting_for_approval" ? gate : null,
		pending_gate_feedback: null,
		...rest,
	};
}

const live = (patch: Partial<RunState> = {}): RunState => ({ ...INITIAL_RUN_STATE, ...patch });

describe("reconcileRunState: server is the source of truth", () => {
	it("a reload at a gate rebuilds the pending approval from runs/current", () => {
		const next = reconcileRunState(live(), control(), 1000);
		expect(next).toMatchObject({
			isGenerating: true,
			currentRunId: 7,
			awaitingConfirm: true,
			awaitingAgent: "outline",
			currentStage: "plan_approval",
			syncedAt: 1000,
		});
		expect(next.recoveryGate?.current_stage).toBe("outline_approval");
		expect(next.feedbackReceipt).toBeNull();
	});

	it("no active run clears stale 生成中 / 待确认 / 可恢复", () => {
		const stale = live({
			isGenerating: true,
			currentRunId: 7,
			awaitingConfirm: true,
			awaitingAgent: "outline",
			recoveryGate: gate,
			recoveryControl: control({ state: "recoverable" }),
		});
		expect(reconcileRunState(stale, null)).toMatchObject({
			isGenerating: false,
			currentRunId: null,
			awaitingConfirm: false,
			recoveryControl: null,
			recoveryGate: null,
		});
	});

	it("a recoverable run is shown as interrupted, not as generating", () => {
		const next = reconcileRunState(
			live({ isGenerating: true, currentRunId: 7, awaitingConfirm: true }),
			control({ state: "recoverable", status: "failed", error: "provider timeout" }),
		);
		expect(next).toMatchObject({ isGenerating: false, currentRunId: null, awaitingConfirm: false });
		expect(next.recoveryControl?.state).toBe("recoverable");
	});

	it("a running run is not at a gate even if a stale gate event said so", () => {
		const next = reconcileRunState(
			live({ isGenerating: true, currentRunId: 7, awaitingConfirm: true, recoveryGate: gate }),
			control({ status: "running" }),
		);
		expect(next).toMatchObject({ isGenerating: true, awaitingConfirm: false, recoveryGate: null });
	});

	it("progress never moves backwards for the same run", () => {
		const next = reconcileRunState(live({ currentRunId: 7, progress: 0.6 }), control({ status: "running" }));
		expect(next.progress).toBe(0.6);
	});

	it("pending feedback at the gate is 已收到; while redoing it is 重做中", () => {
		const pending = { id: "fb1", content: "结局更温暖", entity_type: null, entity_ids: null };
		const atGate = reconcileRunState(live(), control({ pending_gate_feedback: pending }));
		expect(atGate.feedbackReceipt).toMatchObject({ id: "fb1", state: "received", round: 1, content: "结局更温暖" });
		const redoing = reconcileRunState(atGate, control({ status: "running", pending_gate_feedback: pending }));
		expect(redoing.feedbackReceipt).toMatchObject({ id: "fb1", state: "regenerating", round: 1 });
		expect(redoing.awaitingConfirm).toBe(false);
	});

	it("back at the gate after a redo, the receipt comes from the gate payload", () => {
		const revisedGate = {
			...gate,
			feedback: { id: "fb1", round: 1, state: "revised", content: "结局更温暖", reason: null },
		} as RunAwaitingConfirmEventData;
		const next = reconcileRunState(live(), control({ awaiting_gate: revisedGate }));
		expect(next.awaitingConfirm).toBe(true);
		expect(next.feedbackReceipt).toMatchObject({ id: "fb1", state: "revised", round: 1, gate: "outline_approval" });
	});

	it("receiptFromGate is null on a first arrival", () => {
		expect(receiptFromGate(gate)).toBeNull();
		expect(receiptFromGate(null)).toBeNull();
	});
});
