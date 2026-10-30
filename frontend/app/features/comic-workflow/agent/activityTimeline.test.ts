import { describe, expect, it } from "vitest";
import type { AgentMessage } from "~/types";
import {
	attachLiveStream,
	deriveActivityTimeline,
	formatDuration,
	formatEta,
	groupRepeatedWarnings,
	tidyEllipsis,
	type ActivityEntry,
	type WarningGroup,
} from "./activityTimeline";

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
	it("drops a 正在… line once something came after it, keeps it while it is the latest", () => {
		const feed = [
			msg("step", "生成故事大纲", 0, { agent: "outline" }),
			msg("assistant", "正在生成故事大纲…", 1, { agent: "outline" }),
			msg("assistant", "大纲概要：雨天的纸船", 30, { agent: "outline" }),
		];
		const titles = deriveActivityTimeline(feed).map((e) => e.title);
		expect(titles).toEqual(["生成故事大纲", "大纲概要：雨天的纸船"]);
		expect(deriveActivityTimeline(feed.slice(0, 2), { running: true }).map((e) => e.title)).toContain("正在生成故事大纲…");
	});

	it("drops finished 正在… (n/N) progress once the run moved on", () => {
		const titles = deriveActivityTimeline([
			msg("step", "生成角色形象", 0, { agent: "render" }),
			msg("assistant", "正在绘制：陈望海 (1/2)", 1, { agent: "render" }),
			msg("assistant", "正在绘制：小鸥 (2/2)", 2, { agent: "render" }),
			msg("assistant", "已为 2 个角色生成形象图。", 3, { agent: "render" }),
		]).map((e) => e.title);
		expect(titles).toEqual(["生成角色形象", "已为 2 个角色生成形象图。"]);
	});

	it("folds a thinking line that only repeats the one before it", () => {
		const [step] = deriveActivityTimeline([
			msg("step", "规划角色", 0),
			msg("thinking", "角色设定完成，等待分镜脚本…", 1, { phase: "decision" }),
			msg("thinking", "角色设定完成，等待分镜脚本…", 2),
		]);
		expect(step.children).toHaveLength(1);
		expect(step.children[0].content).toBe("决策 · 角色设定完成，等待分镜脚本…");
	});

	it("turns the ⚠️ mark into a warning row and never shows a shot's database id", () => {
		const entries = deriveActivityTimeline(
			[
				msg("assistant", "⚠️ 分镜 #76 未能完成审查（审查模型没有给出有效评分），保留当前画面，不重新生成。", 0, { agent: "critic" }),
				msg("assistant", "⚠️ 分镜 #99 未能完成审查", 1, { agent: "critic" }),
			],
			{ shotOrderById: new Map([[76, 1]]) },
		);
		expect(entries.map((e) => e.kind)).toEqual(["warning", "warning"]);
		expect(entries[0].title).toBe("S01 未能完成审查（审查模型没有给出有效评分），保留当前画面，不重新生成。");
		expect(entries[1].title).toBe("分镜 未能完成审查");
		expect(entries.map((e) => e.title).join("")).not.toMatch(/⚠|#\d/);
	});

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

	it("does not merge progress of different stages; the finished one gives way", () => {
		const entries = deriveActivityTimeline([
			msg("assistant", "正在绘制分镜 (1/2)", 0, { agent: "render" }),
			msg("assistant", "正在绘制分镜 (2/2)", 5, { agent: "render" }),
			msg("assistant", "正在生成视频 (1/2)", 9, { agent: "compose" }),
		]);
		expect(entries.map((e) => e.title)).toEqual(["正在生成视频 (1/2)"]);
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
			msg("assistant", "正在生成故事大纲…", 1),
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

describe("tidyEllipsis", () => {
	it("把 ... / . . . / 。。。 统一成 …", () => {
		expect(tidyEllipsis("正在生成故事大纲...")).toBe("正在生成故事大纲…");
		expect(tidyEllipsis("开始生成 8 个分镜视频 . . .")).toBe("开始生成 8 个分镜视频…");
		expect(tidyEllipsis("处理中。。。")).toBe("处理中…");
		expect(tidyEllipsis("评分 8.5/10")).toBe("评分 8.5/10");
	});
});

describe("attachLiveStream", () => {
	const e = (id: string, extra: Partial<ActivityEntry>): ActivityEntry => ({
		id,
		kind: "step",
		agent: "outline",
		agentLabel: "大纲",
		title: id,
		status: "done",
		children: [],
		...extra,
	});
	const live = { agent: "outline", status: "streaming" };

	it("hosts the stream in the running step and drops its trailing 「…」 lines", () => {
		const step = e("step", { status: "running" });
		const out = attachLiveStream([e("old", {}), step, e("m", { kind: "message", title: "正在生成故事大纲…" })], live);
		expect(out.host).toBe(step);
		expect(out.entries.map((x) => x.id)).toEqual(["old"]);
	});

	it("keeps its own row when another agent's step runs, a real line follows, or it failed", () => {
		const running = e("step", { status: "running" });
		expect(attachLiveStream([running], { agent: "plan", status: "streaming" }).host).toBeNull();
		expect(attachLiveStream([running, e("m", { kind: "message", title: "正在绘制：小欧 (1/3)" })], live).host).toBeNull();
		expect(attachLiveStream([running], { agent: "outline", status: "error" }).host).toBeNull();
		expect(attachLiveStream([e("done", {})], live).host).toBeNull();
	});
});

describe("deriveActivityTimeline: feedback receipts", () => {
	it("shows a receipt card and drops the duplicate user row", () => {
		const entries = deriveActivityTimeline([
			{ id: "u1", agent: "user", role: "user", content: "更温暖" },
			{
				id: "receipt_fb1",
				agent: "system",
				role: "feedback",
				content: "更温暖",
				receipt: { id: "fb1", round: 1, state: "received", content: "更温暖", reason: null, gate: "outline_approval" },
			},
		]);
		expect(entries.map((entry) => entry.kind)).toEqual(["feedback"]);
		expect(entries[0].receipt?.state).toBe("received");
	});
});

describe("groupRepeatedWarnings", () => {
	const w = (id: string, title: string, agent = "review"): ActivityEntry => ({
		id, kind: "warning", agent, agentLabel: agent === "review" ? "质量审查" : "渲染", title, status: "done", children: [],
	});
	const step = (id: string): ActivityEntry => ({ id, kind: "step", agent: "render", agentLabel: "渲染", title: id, status: "done", children: [] });
	const reason = "未能完成审查（审查模型没有给出有效评分），保留当前画面，不重新生成。";

	it("folds consecutive warnings from one agent into one row, merging subjects when only the subject differs", () => {
		const rows = groupRepeatedWarnings([step("a"), w("1", `阿岚 ${reason}`), w("2", `橘猫 ${reason}`), step("b")]);
		expect(rows.map((r) => r.kind)).toEqual(["step", "warning-group", "step"]);
		const group = rows[1] as WarningGroup;
		expect(group.summary).toBe(`阿岚、橘猫 ${reason}`);
		expect(group.items.map((i) => i.id)).toEqual(["1", "2"]);
	});

	it("lists subjects and a count when the reasons differ", () => {
		const [group] = groupRepeatedWarnings([w("1", `S01 ${reason}`), w("2", "S02 未能完成审查（审查模型调用失败），保留当前画面，不重新生成。")]);
		expect((group as WarningGroup).summary).toBe("S01、S02：2 条提醒");
	});

	it("leaves a single warning, warnings split by a step, and warnings from different agents alone", () => {
		const rows = groupRepeatedWarnings([w("1", "a"), step("s"), w("2", "b"), w("3", "c", "render")]);
		expect(rows.map((r) => r.kind)).toEqual(["warning", "step", "warning", "warning"]);
	});
});
