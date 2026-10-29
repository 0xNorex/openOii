import { describe, expect, it } from "vitest";
import type { AgentMessage } from "~/types";
import { deriveActivityTimeline, formatDuration, formatEta } from "./activityTimeline";

const at = (s: number) => new Date(Date.UTC(2026, 0, 1, 0, 0, s)).toISOString();
const msg = (role: string, content: string, s: number, extra: Partial<AgentMessage> = {}): AgentMessage => ({
	id: `${role}-${s}`,
	agent: "plan",
	role,
	content,
	timestamp: at(s),
	...extra,
});

describe("deriveActivityTimeline", () => {
	it("folds n/N progress lines into one row with a rough time left while running", () => {
		const feed = [
			msg("assistant", "正在生成视频 (1/4)", 0, { agent: "compose" }),
			msg("assistant", "正在生成视频 (2/4)", 10, { agent: "compose" }),
			msg("assistant", "正在生成视频 (3/4)", 20, { agent: "compose" }),
		];
		const running = deriveActivityTimeline(feed, { running: true });
		expect(running).toHaveLength(1);
		expect(running[0]).toMatchObject({ title: "正在生成视频 (3/4)", detail: "剩余约 20 秒" });

		const done = deriveActivityTimeline(feed);
		expect(done).toHaveLength(1);
		expect(done[0].detail).toBeUndefined();
	});

	it("keeps progress of different stages as separate rows", () => {
		const entries = deriveActivityTimeline([
			msg("assistant", "正在绘制分镜 (1/2)", 0, { agent: "render" }),
			msg("assistant", "正在绘制分镜 (2/2)", 5, { agent: "render" }),
			msg("assistant", "正在生成视频 (1/2)", 9, { agent: "compose" }),
		]);
		expect(entries.map((e) => e.title)).toEqual(["正在绘制分镜 (2/2)", "正在生成视频 (1/2)"]);
	});

	it("groups tool rows under the current step and measures its duration", () => {
		const entries = deriveActivityTimeline([
			msg("separator", "━━", 0, { agent: "system" }),
			msg("step", "生成故事大纲", 1),
			msg("tool_call", "文本生成", 2),
			msg("tool_result", "文本生成", 5),
			msg("assistant", "主角在创作工作台验证生成链路。", 7),
		]);

		expect(entries.map((e) => e.kind)).toEqual(["run", "step", "message"]);
		const step = entries[1];
		expect(step).toMatchObject({ title: "生成故事大纲", agentLabel: "规划", status: "done", durationMs: 4000 });
		expect(step.children.map((c) => c.label)).toEqual(["调用", "工具结果"]);
	});

	it("keeps tool rows that follow an assistant message under the open step", () => {
		const entries = deriveActivityTimeline([
			msg("step", "生成故事大纲", 0),
			msg("assistant", "正在生成故事大纲...", 1),
			msg("tool_call", "文本生成", 2),
			msg("tool_result", "文本生成", 9),
		]);

		expect(entries.map((e) => e.kind)).toEqual(["step", "message"]);
		expect(entries[0].children).toHaveLength(2);
		expect(entries[0].durationMs).toBe(9000);
	});

	it("opens a step for orphan tool rows and splits by agent", () => {
		const entries = deriveActivityTimeline([
			msg("thinking", "", 0, { phase: "planning" }),
			msg("tool_call", "渲染首帧", 1, { agent: "render" }),
		]);

		expect(entries).toHaveLength(2);
		expect(entries[0]).toMatchObject({ kind: "step", title: "规划" });
		expect(entries[0].children[0]).toMatchObject({ label: "思考", content: "规划" });
		expect(entries[1]).toMatchObject({ kind: "step", title: "渲染", agent: "render" });
	});

	it("drops system info and empty messages, keeps errors with details", () => {
		const entries = deriveActivityTimeline([
			msg("info", "已确认，继续执行…", 0, { agent: "system" }),
			msg("assistant", "   ", 1),
			msg("error", "生成失败: timeout", 2, { agent: "system", details: "provider=doubao" }),
		]);

		expect(entries).toEqual([
			expect.objectContaining({ kind: "error", status: "error", detail: "provider=doubao" }),
		]);
	});

	it("marks the last step of the current run as running", () => {
		const entries = deriveActivityTimeline(
			[msg("step", "规划镜头", 0), msg("tool_call", "文本生成", 3), msg("handoff", "交给渲染", 4)],
			{ running: true },
		);

		expect(entries[0].status).toBe("running");
		expect(entries[0].durationMs).toBeUndefined();
		expect(entries[1]).toMatchObject({ kind: "handoff", title: "交给渲染" });
	});

	it("does not mark steps from an earlier run as running", () => {
		const entries = deriveActivityTimeline(
			[msg("step", "上一轮", 0), msg("separator", "━━", 1, { agent: "system" })],
			{ running: true },
		);

		expect(entries[0].status).toBe("done");
	});
});

describe("formatDuration", () => {
	it("formats ms, seconds and minutes", () => {
		expect(formatDuration(450)).toBe("450ms");
		expect(formatDuration(3200)).toBe("3.2s");
		expect(formatDuration(42_000)).toBe("42s");
		expect(formatDuration(64_000)).toBe("1m 4s");
	});
});

describe("formatEta", () => {
	it("rounds to seconds under a minute and minutes above", () => {
		expect(formatEta(400)).toBe("约 1 秒");
		expect(formatEta(42_000)).toBe("约 42 秒");
		expect(formatEta(150_000)).toBe("约 3 分钟");
	});
});
