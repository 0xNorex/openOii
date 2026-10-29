import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/utils/toast", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() } }));

import { applyWsEvent } from "~/hooks/applyWsEvent";
import { clearMessageFeed, readMessageFeed } from "~/query/messageFeed";
import { patchRunState, readRunState, resetRunState } from "~/query/runState";

const send = (type: string, data: Record<string, unknown>) =>
	applyWsEvent(1, { type, data } as never, "manual", vi.fn());

const gate = (extra: Record<string, unknown> = {}) => ({
	run_id: 9,
	agent: "outline",
	current_stage: "outline_approval",
	stage: "outline_approval",
	message: "大纲已完成",
	recovery_summary: { current_stage: "outline_approval" },
	...extra,
});

describe("gate feedback projection", () => {
	beforeEach(() => {
		resetRunState(1);
		clearMessageFeed(1);
		patchRunState(1, { isGenerating: true, currentRunId: 9 });
	});

	it("feedback round-trip stays at the same gate and never auto-advances", () => {
		send("run_awaiting_confirm", gate());
		expect(readRunState(1)).toMatchObject({ awaitingConfirm: true, feedbackReceipt: null });

		send("run_feedback", { run_id: 9, feedback_id: "fb1", round: 1, state: "received", content: "更温暖", stage: "outline_approval" });
		expect(readRunState(1).feedbackReceipt).toMatchObject({ id: "fb1", state: "received" });
		expect(readRunState(1).awaitingConfirm).toBe(true);

		send("run_feedback", { run_id: 9, feedback_id: "fb1", round: 1, state: "regenerating" });
		expect(readRunState(1)).toMatchObject({ awaitingConfirm: false, recoveryGate: null, isGenerating: true });
		expect(readRunState(1).feedbackReceipt).toMatchObject({ state: "regenerating", content: "更温暖" });

		send("run_awaiting_confirm", gate({ feedback: { id: "fb1", round: 1, state: "revised", content: "更温暖" } }));
		const state = readRunState(1);
		expect(state.awaitingConfirm).toBe(true);
		expect(state.recoveryGate?.current_stage).toBe("outline_approval");
		expect(state.feedbackReceipt).toMatchObject({ id: "fb1", state: "revised", round: 1 });
	});

	it("not_applied carries its reason back to the same gate", () => {
		send("run_awaiting_confirm", gate({ current_stage: "compose_approval", stage: "compose_approval" }));
		send("run_awaiting_confirm", gate({
			current_stage: "compose_approval",
			stage: "compose_approval",
			feedback: { id: "fb2", round: 1, state: "not_applied", content: "改一下", reason: "请先选中要改的镜头" },
		}));
		expect(readRunState(1).feedbackReceipt).toMatchObject({ state: "not_applied", reason: "请先选中要改的镜头" });
		expect(readRunState(1).awaitingConfirm).toBe(true);
	});

	it("a resumed run that comes back with the same receipt updates the archived card", () => {
		send("run_feedback", { run_id: 9, feedback_id: "fb3", round: 1, state: "regenerating", content: "远景", stage: "shots_approval" });
		// resuming starts the run again, which archives the in-flight receipt
		send("run_started", { run_id: 9, current_stage: "plan" });
		send("run_awaiting_confirm", gate({
			current_stage: "shots_approval",
			stage: "shots_approval",
			feedback: { id: "fb3", round: 1, state: "revised", content: "远景" },
		}));
		const archived = readMessageFeed(1).filter((msg) => msg.id === "receipt_fb3");
		expect(archived).toHaveLength(1);
		expect(archived[0]?.receipt?.state).toBe("revised");
		expect(readRunState(1).feedbackReceipt?.state).toBe("revised");
	});

	it("approving archives the receipt into the activity feed", () => {
		send("run_awaiting_confirm", gate({ feedback: { id: "fb1", round: 1, state: "revised", content: "更温暖" } }));
		send("run_confirmed", { run_id: 9 });
		expect(readRunState(1).feedbackReceipt).toBeNull();
		const archived = readMessageFeed(1).filter((msg) => msg.role === "feedback");
		expect(archived).toHaveLength(1);
		expect(archived[0]).toMatchObject({ id: "receipt_fb1", receipt: { state: "revised" } });
	});

	it("ignores receipts for another run", () => {
		send("run_feedback", { run_id: 99, feedback_id: "x", round: 1, state: "received", content: "?" });
		expect(readRunState(1).feedbackReceipt).toBeNull();
	});
});
