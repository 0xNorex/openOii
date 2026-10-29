import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("~/utils/toast", () => ({ toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() } }));

import { applyWsEvent } from "~/hooks/applyWsEvent";
import { patchRunState, readRunState, resetRunState } from "~/query/runState";
import { recallFailedStream } from "~/features/comic-workflow/agent/liveStream";

const send = (type: string, data: Record<string, unknown>) =>
	applyWsEvent(1, { type, data } as never, "manual", vi.fn());

const frame = (extra: Record<string, unknown> = {}) => ({
	stream_id: "s1",
	agent: "outline",
	status: "streaming",
	thinking: "先读故事",
	text: "",
	chars: 0,
	...extra,
});

describe("llm_stream projection", () => {
	beforeEach(() => {
		resetRunState(1);
		patchRunState(1, { isGenerating: true, currentRunId: 9 });
	});

	it("latest snapshot wins, done clears the row", () => {
		send("llm_stream", frame());
		send("llm_stream", frame({ text: "午后的猫", chars: 30 }));
		expect(readRunState(1).liveStream).toMatchObject({ streamId: "s1", text: "午后的猫", chars: 30 });
		send("llm_stream", frame({ stream_id: "old", status: "done" }));
		expect(readRunState(1).liveStream?.streamId).toBe("s1");
		send("llm_stream", frame({ status: "done" }));
		expect(readRunState(1).liveStream).toBeNull();
	});

	it("cancel clears the row", () => {
		send("llm_stream", frame({ text: "半句" }));
		send("run_cancelled", { run_id: 9 });
		expect(readRunState(1).liveStream).toBeNull();
		// a frame that was already in flight does not bring the row back
		send("llm_stream", frame({ text: "半句话" }));
		expect(readRunState(1).liveStream).toBeNull();
	});

	it("an interrupted stream stays visible through run_failed, until the next run", () => {
		send("llm_stream", frame({ status: "error", text: "半句", error: "连接断开" }));
		send("run_failed", { run_id: 9, error: "llm error: 连接断开" });
		expect(readRunState(1)).toMatchObject({
			isGenerating: false,
			liveStream: { status: "error", text: "半句", error: "连接断开" },
		});
		expect(recallFailedStream(1)).toMatchObject({ status: "error", text: "半句" });
		send("run_started", { run_id: 10, project_id: 1 });
		expect(readRunState(1).liveStream).toBeNull();
		expect(recallFailedStream(1)).toBeNull();
	});

	it("frames move the run progress forward only; agent messages do not touch it", () => {
		patchRunState(1, { progress: 0.1 });
		send("run_message", { agent: "outline", role: "assistant", content: "正在生成故事大纲…", progress: 0 });
		expect(readRunState(1).progress).toBe(0.1);
		send("llm_stream", frame({ text: "午后的猫", progress: 0.05 }));
		expect(readRunState(1).progress).toBe(0.1);
		send("llm_stream", frame({ text: "午后的猫醒来", progress: 0.12 }));
		expect(readRunState(1).progress).toBe(0.12);
		send("run_message", { agent: "outline", role: "assistant", content: "已完成故事大纲", progress: 1 });
		expect(readRunState(1).progress).toBe(0.12);
	});

	it("a gate clears a row whose done frame never arrived", () => {
		send("llm_stream", frame({ text: "午后的猫" }));
		send("run_awaiting_confirm", { run_id: 9, agent: "outline", message: "请确认", auto_mode: true });
		expect(readRunState(1).liveStream).toBeNull();
	});
});
