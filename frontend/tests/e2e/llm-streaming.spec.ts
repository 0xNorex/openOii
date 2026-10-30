import { expect, test, type Page } from "@playwright/test";

/**
 * Live LLM output (`llm_stream` frames) in the activity timeline. The websocket
 * is mocked; frames are snapshots, so a page that joins mid-stream only needs
 * the next one.
 */

declare global {
	interface Window {
		__mockWs: { count: () => number; dispatch: (event: Record<string, unknown>) => void };
	}
}

const project = {
	id: 7,
	title: "创意项目",
	story: "一只小猫在午后寻找水源",
	style: "anime",
	summary: null,
	video_url: null,
	status: "active",
	target_shot_count: 6,
	character_hints: [],
	creation_mode: "story",
	reference_images: [],
	provider_settings: {
		text: { selected_key: "fake", resolved_key: "fake", source: "default", valid: true, status: "valid", reason_message: null },
		image: { selected_key: "fake", resolved_key: "fake", source: "default", valid: true, status: "valid", reason_message: null },
		video: { selected_key: "fake", resolved_key: "fake", source: "default", valid: true, status: "valid", reason_message: null },
	},
	created_at: "2026-05-05T00:00:00Z",
	updated_at: "2026-05-05T00:00:00Z",
};

const activeRun = {
	state: "active",
	detail: "运行中",
	available_actions: ["cancel"],
	thread_id: "thread-7",
	active_run: { id: 901, current_agent: "outline", progress: 0.05, provider_snapshot: null },
	recovery_summary: { current_stage: "plan", next_stage: "plan", preserved_stages: [] },
};

async function setup(page: Page) {
	const state = { running: false, cancelCalls: 0, status: "active" };
	await page.addInitScript(() => {
		class MockWebSocket {
			static instances: MockWebSocket[] = [];
			static OPEN = 1;
			static CLOSED = 3;
			readyState = MockWebSocket.OPEN;
			onopen: null | ((event?: Event) => void) = null;
			onmessage: null | ((event: MessageEvent<string>) => void) = null;
			onerror: null | ((event?: Event) => void) = null;
			onclose: null | ((event?: Event) => void) = null;
			constructor(public url: string) {
				MockWebSocket.instances.push(this);
				queueMicrotask(() => this.onopen?.(new Event("open")));
			}
			send() {}
			close() {
				this.readyState = MockWebSocket.CLOSED;
				this.onclose?.(new Event("close"));
			}
		}
		Object.defineProperty(window, "WebSocket", { configurable: true, writable: true, value: MockWebSocket });
		window.__mockWs = {
			count: () => MockWebSocket.instances.length,
			dispatch: (event) => {
				const socket = MockWebSocket.instances.at(-1);
				if (!socket?.onmessage) throw new Error("No active mock websocket instance");
				socket.onmessage(new MessageEvent("message", { data: JSON.stringify(event) }));
			},
		};
	});
	await page.route("**/api/v1/**", async (route) => {
		const { pathname } = new URL(route.request().url());
		const method = route.request().method();
		const json = (body: unknown, status = 200) =>
			route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
		if (pathname === "/api/v1/config") return json([]);
		if (pathname === "/api/v1/projects") return json({ items: [project], total: 1 });
		if (pathname === "/api/v1/projects/7") return json({ ...project, status: state.status });
		if (/^\/api\/v1\/projects\/7\/(characters|shots|messages)$/.test(pathname)) return json([]);
		if (pathname === "/api/v1/projects/7/runs/current") return json(state.running ? activeRun : null);
		if (pathname === "/api/v1/runs/901/cancel" && method === "POST") {
			state.cancelCalls += 1;
			state.running = false;
			return json({ status: "cancelled", cancelled: 1, run_ids: [901] });
		}
		return json({ error: { message: `Unhandled route: ${method} ${pathname}` } }, 404);
	});
	return state;
}

async function open(page: Page, reload = false) {
	if (reload) await page.reload();
	else await page.goto("/project/7");
	await page.waitForLoadState("networkidle");
	await expect.poll(() => page.evaluate(() => window.__mockWs.count())).toBeGreaterThan(0);
	const pill = page.getByRole("button", { name: "展开活动面板" });
	if (await pill.isVisible()) await pill.click();
	await expect(page.locator("aside[aria-label='工作流活动']")).toBeVisible();
}

const dispatch = (page: Page, event: Record<string, unknown>) =>
	page.evaluate((e) => window.__mockWs.dispatch(e), event);

const frame = (extra: Record<string, unknown>) => ({
	type: "llm_stream",
	data: { stream_id: "s1", agent: "outline", status: "streaming", thinking: "", text: "", chars: 0, ...extra },
});

async function startRun(page: Page, state: { running: boolean }) {
	state.running = true;
	await dispatch(page, {
		type: "run_started",
		data: { run_id: 901, project_id: 7, current_agent: "outline", current_stage: "plan", stage: "plan" },
	});
}

const THINKING = "先读故事梗概，找出主角想要什么、挡在面前的是什么。";
const PART_1 = "小猫的午后 · 一只橘猫在阳光里醒来";
const PART_2 = `${PART_1}，发现水碗空了，开始穿过客厅寻找水源🐾`;

test("text streams in incrementally: thinking first, then typed-out output", async ({ page }) => {
	const state = await setup(page);
	await open(page);
	await startRun(page, state);

	const row = page.getByTestId("live-stream");
	await dispatch(page, frame({ thinking: THINKING }));
	await expect(row).toContainText("大纲 · 正在思考");
	await expect(page.getByTestId("live-stream-text")).toHaveText(THINKING);

	await dispatch(page, frame({ thinking: THINKING, text: PART_1, chars: 40 }));
	await expect(row).toContainText("正在输出");
	await expect(page.getByTestId("live-stream-text")).toHaveText(PART_1);

	// The next snapshot is typed out over a few frames, not swapped in at once.
	const lengths = await page.evaluate(
		async ({ next }) => {
			const el = document.querySelector("[data-testid='live-stream-text']")!;
			window.__mockWs.dispatch({
				type: "llm_stream",
				data: { stream_id: "s1", agent: "outline", status: "streaming", thinking: "", text: next, chars: 90 },
			});
			const seen: number[] = [];
			const until = performance.now() + 600;
			while (performance.now() < until) {
				seen.push(Array.from(el.textContent ?? "").length);
				await new Promise(requestAnimationFrame);
			}
			return seen;
		},
		{ next: PART_2 },
	);
	const from = Array.from(PART_1).length;
	const to = Array.from(PART_2).length;
	expect(lengths.some((n) => n > from && n < to)).toBe(true);
	expect(lengths.at(-1)).toBe(to);
	for (let i = 1; i < lengths.length; i += 1) expect(lengths[i], JSON.stringify(lengths)).toBeGreaterThanOrEqual(lengths[i - 1]!);
	await expect(row).toContainText("90 字符");

	// A finished call leaves no live row.
	await dispatch(page, frame({ status: "done", text: PART_2 }));
	await expect(row).toHaveCount(0);
});

test("stop mid-stream removes the live row and late frames do not bring it back", async ({ page }) => {
	const state = await setup(page);
	await open(page);
	await startRun(page, state);
	await dispatch(page, frame({ thinking: THINKING, text: PART_1, chars: 40 }));
	await expect(page.getByTestId("live-stream")).toBeVisible();

	await page.getByRole("button", { name: "停止生成" }).click();
	await expect.poll(() => state.cancelCalls).toBe(1);
	await expect(page.getByTestId("live-stream")).toHaveCount(0);
	await expect(page.getByText("生成已停止").first()).toBeVisible();

	// a frame that was already queued before the stop
	await dispatch(page, frame({ text: PART_2, chars: 90 }));
	await expect(page.getByTestId("live-stream")).toHaveCount(0);
	await expect(page.getByRole("button", { name: "停止生成" })).toHaveCount(0);
});

test("refresh mid-stream picks the stream back up from the next frame", async ({ page }) => {
	const state = await setup(page);
	await open(page);
	await startRun(page, state);
	await dispatch(page, frame({ thinking: THINKING, text: PART_1, chars: 40 }));
	await expect(page.getByTestId("live-stream-text")).toHaveText(PART_1);

	await page.reload();
	await page.waitForLoadState("networkidle");
	await expect.poll(() => page.evaluate(() => window.__mockWs.count())).toBeGreaterThan(0);
	const pill = page.getByRole("button", { name: "展开活动面板" });
	if (await pill.isVisible()) await pill.click();
	// the run is recovered over HTTP; stop is available again
	await expect(page.getByRole("button", { name: "停止生成" })).toBeVisible();

	await dispatch(page, frame({ thinking: THINKING, text: PART_2, chars: 90 }));
	// joining mid-stream shows the snapshot at once instead of re-typing it
	await expect(page.getByTestId("live-stream-text")).toHaveText(PART_2);
	await expect(page.getByTestId("live-stream")).toContainText("正在输出");
});

test("an error mid-stream keeps the partial output and says why", async ({ page }) => {
	const state = await setup(page);
	await open(page);
	await startRun(page, state);
	await dispatch(page, frame({ thinking: THINKING, text: PART_1, chars: 40 }));
	await expect(page.getByTestId("live-stream-text")).toHaveText(PART_1);

	await dispatch(page, frame({ status: "error", text: PART_1, chars: 40, error: "llm error: 连接被重置" }));
	// The server records the failure before it announces it.
	state.running = false;
	await dispatch(page, {
		type: "run_failed",
		data: { run_id: 901, project_id: 7, error: "llm error: 连接被重置", error_code: "provider", retryable: true },
	});

	const row = page.getByTestId("live-stream");
	await expect(row).toHaveAttribute("data-status", "error");
	await expect(row).toContainText("大纲 · 输出中断");
	await expect(row.getByRole("alert")).toHaveText("llm error: 连接被重置");
	await expect(page.getByTestId("live-stream-text")).toHaveText(PART_1);
	await expect(row.locator(".stream-caret")).toHaveCount(0);
	await expect(page.getByRole("button", { name: "停止生成" })).toHaveCount(0);

	// A reload of the failed project keeps the cut-off output and the reason.
	state.running = false;
	state.status = "failed";
	await open(page, true);
	// A failed project opens on 待处理; the cut-off output is under 活动.
	await page.getByRole("tab", { name: "活动" }).click();
	await expect(row).toHaveAttribute("data-status", "error");
	await expect(row.getByRole("alert")).toHaveText("llm error: 连接被重置");
	await expect(page.getByTestId("live-stream-text")).toHaveText(PART_1);

	// The next run starts clean, and a later reload does not bring the old row back.
	await startRun(page, state);
	await expect(row).toHaveCount(0);
	state.running = false;
	await open(page, true);
	await page.getByRole("tab", { name: "活动" }).click();
	await expect(page.getByRole("tab", { name: "活动" })).toHaveAttribute("aria-selected", "true");
	await expect(row).toHaveCount(0);
});

test("the stream folds into its running step, moves progress, and hides bare separators", async ({ page }) => {
	const state = await setup(page);
	await open(page);
	await startRun(page, state);
	const message = (role: string, content: string) => ({
		type: "run_message",
		data: { agent: "outline", role, content, isLoading: true, progress: 0, project_id: 7, run_id: 901 },
	});
	await dispatch(page, message("step", "生成故事大纲"));
	await dispatch(page, message("assistant", "正在生成故事大纲…"));
	const timeline = page.getByRole("list", { name: "活动时间线" });
	await expect(timeline).toContainText("大纲 · 进行中");

	await dispatch(page, frame({ thinking: THINKING, text: PART_1, chars: 40, progress: 0.05 }));
	const row = page.getByTestId("live-stream");
	await expect(row).toContainText("大纲 · 正在输出");
	await expect(row).toContainText("生成故事大纲");
	// One row for the step: no separate 「进行中」 or 「正在生成…」 lines.
	await expect(timeline).not.toContainText("进行中");
	await expect(timeline).not.toContainText("正在生成故事大纲…");
	await expect(timeline.locator(":scope > li[data-status]")).toHaveCount(1);
	// Progress reads as steps, never a percentage that can sit at 0%.
	await expect(page.getByRole("button", { name: /^状态：/ })).toContainText("生成中");
	await expect(page.getByRole("button", { name: /^状态：/ })).not.toContainText("%");

	// A new value is typed out without a bare " · " ever at the tail.
	const tails = await page.evaluate(async (next) => {
		const el = document.querySelector("[data-testid='live-stream-text']")!;
		window.__mockWs.dispatch({
			type: "llm_stream",
			data: { stream_id: "s1", agent: "outline", status: "streaming", thinking: "", text: next, chars: 60 },
		});
		const seen: string[] = [];
		const until = performance.now() + 600;
		while (performance.now() < until) {
			seen.push(el.textContent ?? "");
			await new Promise(requestAnimationFrame);
		}
		return seen;
	}, `${PART_1} · 水碗空了`);
	expect(tails.at(-1)).toBe(`${PART_1} · 水碗空了`);
	expect(tails.filter((t) => /·\s*$/.test(t))).toEqual([]);

	await dispatch(page, frame({ status: "done", text: PART_1 }));
	await expect(row).toHaveCount(0);
	await expect(timeline).toContainText("大纲 · 进行中");
});

test("the timeline keeps only what happened: no stale 正在…, no repeated thinking, warnings with an icon and no ids", async ({ page }) => {
	const state = await setup(page);
	await open(page);
	await startRun(page, state);
	const message = (agent: string, role: string, content: string, extra: Record<string, unknown> = {}) => ({
		type: "run_message",
		data: { agent, role, content, isLoading: false, project_id: 7, run_id: 901, ...extra },
	});
	await dispatch(page, message("outline", "step", "生成故事大纲"));
	await dispatch(page, message("outline", "assistant", "正在生成故事大纲…"));
	await dispatch(page, message("outline", "thinking", "大纲已完成，等待角色设定…", { phase: "decision" }));
	await dispatch(page, message("outline", "thinking", "大纲已完成，等待角色设定…"));
	await dispatch(page, message("outline", "assistant", "大纲概要：雨天的纸船"));
	await dispatch(page, message("critic", "assistant", "⚠️ 分镜 #76 未能完成审查（审查模型没有给出有效评分），保留当前画面，不重新生成。"));

	const timeline = page.getByRole("list", { name: "活动时间线" });
	await expect(timeline).toContainText("大纲概要：雨天的纸船");
	await expect(timeline).not.toContainText("正在生成故事大纲…");
	await expect(timeline).toContainText("1 项细节");
	const warning = timeline.locator("[data-activity='warning']");
	await expect(warning).toHaveCount(1);
	await expect(warning).toContainText("提醒");
	await expect(warning.locator("svg")).toHaveCount(1);
	await expect(timeline).not.toContainText("⚠");
	await expect(timeline).not.toContainText("#76");
});

test("repeated review warnings fold into one ×N row that expands to each, in order", async ({ page }) => {
	const state = await setup(page);
	await open(page);
	await startRun(page, state);
	const message = (agent: string, role: string, content: string) => ({
		type: "run_message",
		data: { agent, role, content, isLoading: false, project_id: 7, run_id: 901 },
	});
	const reason = "未能完成审查（审查模型没有给出有效评分），保留当前画面，不重新生成。";
	await dispatch(page, message("critic", "step", "检查角色一致性"));
	await dispatch(page, message("critic", "assistant", `⚠️ 阿岚 ${reason}`));
	await dispatch(page, message("critic", "assistant", `⚠️ 橘猫 ${reason}`));
	await dispatch(page, message("critic", "assistant", `⚠️ 灯塔 ${reason}`));

	const timeline = page.getByRole("list", { name: "活动时间线" });
	const group = timeline.locator("[data-activity='warning-group']");
	await expect(group).toHaveCount(1);
	await expect(timeline.locator(":scope > li[data-activity='warning']")).toHaveCount(0);
	await expect(group).toContainText("×3");
	await expect(group).toContainText(`阿岚、橘猫、灯塔 ${reason}`);

	const toggle = group.getByRole("button", { name: /逐条查看 3 条/ });
	await expect(toggle).toHaveAttribute("aria-expanded", "false");
	await toggle.focus();
	await page.keyboard.press("Enter");
	await expect(toggle).toHaveAttribute("aria-expanded", "true");
	await expect(group.locator("[data-activity='warning-item']")).toHaveText([`阿岚 ${reason}`, `橘猫 ${reason}`, `灯塔 ${reason}`]);
});
