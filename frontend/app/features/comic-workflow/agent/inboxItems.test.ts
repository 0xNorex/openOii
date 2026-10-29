import { describe, expect, it } from "vitest";
import type { RecoveryControlRead, RunAwaitingConfirmEventData } from "~/types";
import { deriveInboxItems, gateSection, type DeriveInboxInput } from "./inboxItems";

const base: DeriveInboxInput = {
	awaitingConfirm: false,
	awaitingAgent: null,
	recoveryGate: null,
	recoveryControl: null,
	isGenerating: false,
};

const recoverable = {
	state: "recoverable",
	detail: "可恢复",
	available_actions: ["resume", "cancel"],
	active_run: {},
	recovery_summary: { current_stage: "render", preserved_stages: ["plan", "plan_approval"] },
} as unknown as RecoveryControlRead;

describe("deriveInboxItems", () => {
	it("is empty when nothing needs attention", () => {
		expect(deriveInboxItems(base)).toEqual([]);
	});

	it("lists the approval gate with the agent name and question", () => {
		const gate = { agent: "plan", question: "大纲可以吗？" } as RunAwaitingConfirmEventData;
		const items = deriveInboxItems({ ...base, awaitingConfirm: true, awaitingAgent: "plan", recoveryGate: gate });
		expect(items).toEqual([
			expect.objectContaining({ kind: "gate", title: "规划已完成，等待确认", detail: "大纲可以吗？", gate }),
		]);
	});

	it("names the gate after what it produced and points at its canvas section", () => {
		const gate = { agent: "plan", current_stage: "characters_approval" } as RunAwaitingConfirmEventData;
		const [item] = deriveInboxItems({ ...base, awaitingConfirm: true, awaitingAgent: "plan", recoveryGate: gate });
		expect(item.title).toBe("角色设定已完成，等待确认");
		expect(gateSection(gate)).toBe("elements");
		const shots = { agent: "plan", current_stage: "shots_approval" } as RunAwaitingConfirmEventData;
		const [next] = deriveInboxItems({ ...base, awaitingConfirm: true, awaitingAgent: "plan", recoveryGate: shots });
		expect(next.title).toBe("分镜脚本已完成，等待确认");
		// 同一个 agent 的两个门也要各自重新提醒
		expect(next.id).not.toBe(item.id);
		expect(gateSection(shots)).toBe("shotline");
	});

	it("gives each gate its own id so a new stage re-opens the inbox", () => {
		const [plan] = deriveInboxItems({ ...base, awaitingConfirm: true, awaitingAgent: "plan" });
		const [render] = deriveInboxItems({ ...base, awaitingConfirm: true, awaitingAgent: "render" });
		expect(plan.id).not.toBe(render.id);
	});

	it("does not list a recoverable run behind an open gate", () => {
		const items = deriveInboxItems({ ...base, awaitingConfirm: true, recoveryControl: recoverable });
		expect(items.map((i) => i.kind)).toEqual(["gate"]);
	});

	it("lists a recoverable run with its stage and kept artefacts", () => {
		const [item] = deriveInboxItems({ ...base, recoveryControl: recoverable });
		expect(item).toMatchObject({ kind: "recoverable", title: "运行中断于渲染阶段", detail: "已保留 2 个阶段的产物，可以继续" });
	});

	it("offers only cancel when the run cannot be resumed", () => {
		const [item] = deriveInboxItems({
			...base,
			recoveryControl: { ...recoverable, available_actions: ["cancel"] },
		});
		expect(item).toMatchObject({ kind: "recoverable", resumable: false, detail: "这次运行无法接着跑，取消后可以重新生成" });
	});

	it("treats a control without available_actions as resumable", () => {
		const { available_actions: _omit, ...legacy } = recoverable;
		const [item] = deriveInboxItems({ ...base, recoveryControl: legacy as RecoveryControlRead });
		expect(item).toMatchObject({ kind: "recoverable", resumable: true });
	});

	it("ignores an active (not recoverable) control", () => {
		expect(deriveInboxItems({ ...base, recoveryControl: { ...recoverable, state: "active" } })).toEqual([]);
	});

	it("lists blocking clips and a failed run together", () => {
		const clips = [{ shot_id: 3, order: 2, status: "failed", reason: "视频失败" }];
		const items = deriveInboxItems({ ...base, blockingClips: clips, projectStatus: "failed" });
		expect(items.map((i) => i.kind)).toEqual(["blocked", "failed"]);
		expect(items[0]).toMatchObject({ title: "1 个分镜阻塞成片", clips });
	});

	it("hides the failed item while a new run is generating", () => {
		expect(deriveInboxItems({ ...base, projectStatus: "failed", isGenerating: true })).toEqual([]);
	});
});

describe("deriveInboxItems: gate feedback receipts", () => {
	const gate = { agent: "outline", current_stage: "outline_approval" } as RunAwaitingConfirmEventData;
	const atGate = { ...base, awaitingConfirm: true, awaitingAgent: "outline", recoveryGate: gate, isGenerating: true };
	const receipt = (state: "received" | "revised" | "not_applied" | "failed", reason: string | null = null) => ({
		id: "fb1",
		round: 1,
		state,
		content: "更温暖",
		reason,
		gate: "outline_approval",
	});

	it("blocks approval while the change request is pending", () => {
		const [item] = deriveInboxItems({ ...atGate, feedbackReceipt: receipt("received") });
		expect(item).toMatchObject({ kind: "gate", confirmBlocked: true, title: "已收到修改意见，故事大纲重做中" });
	});

	it("a revised version waits at the same gate as 第 2 版", () => {
		const [item] = deriveInboxItems({ ...atGate, feedbackReceipt: receipt("revised") });
		expect(item).toMatchObject({ kind: "gate", id: "gate:outline_approval", confirmBlocked: false, title: "故事大纲第 2 版，等待确认" });
	});

	it("not_applied shows the explicit reason", () => {
		const [item] = deriveInboxItems({ ...atGate, feedbackReceipt: receipt("not_applied", "请先选中镜头") });
		expect(item).toMatchObject({ title: "故事大纲没有改动，等待确认", detail: "请先选中镜头" });
	});
});

describe("deriveInboxItems: one card for failed + recoverable", () => {
	it("merges the failure reason into the recoverable card", () => {
		const control = {
			...recoverable,
			active_run: { id: 3, error: "图像服务超时" },
		} as unknown as RecoveryControlRead;
		const items = deriveInboxItems({ ...base, recoveryControl: control, projectStatus: "failed" });
		expect(items.map((item) => item.kind)).toEqual(["recoverable"]);
		expect(items[0]).toMatchObject({ detail: expect.stringContaining("图像服务超时") });
	});

	it("keeps the failed card when nothing can be resumed", () => {
		const items = deriveInboxItems({ ...base, projectStatus: "failed" });
		expect(items.map((item) => item.kind)).toEqual(["failed"]);
	});
});
