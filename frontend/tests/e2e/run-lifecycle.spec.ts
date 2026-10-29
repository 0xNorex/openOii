import { expect, test, type Page } from "@playwright/test";

/**
 * 运行生命周期（P0-4 及之后）：重新生成先确认、停止放回上一版、取消清掉中断态、
 * 中断卡片讲人话、修改回执刷新后还在且排在重做产物之前、开始生成立刻有反馈。
 */

type Json = Record<string, unknown> | unknown[] | null;

declare global {
	interface Window {
		__mockWs: { count: () => number; dispatch: (event: Record<string, unknown>) => void };
	}
}

const providers = {
	text: { selected_key: "openai", resolved_key: "openai", source: "default", valid: true, status: "valid", reason_message: null },
	image: { selected_key: "fal", resolved_key: "fal", source: "default", valid: true, status: "valid", reason_message: null },
	video: { selected_key: "runway", resolved_key: "runway", source: "default", valid: true, status: "valid", reason_message: null },
};

function project(patch: Record<string, unknown> = {}) {
	return {
		id: 7,
		title: "午后小猫",
		story: "一只小猫在午后寻找水源",
		style: "anime",
		summary: "小猫找水的温馨小片段。",
		video_url: null,
		status: "active",
		target_shot_count: 2,
		character_hints: [],
		creation_mode: "story",
		reference_images: [],
		provider_settings: providers,
		created_at: "2026-05-05T00:00:00Z",
		updated_at: "2026-05-05T00:00:00Z",
		...patch,
	};
}

const character = {
	id: 1,
	project_id: 7,
	name: "小猫",
	description: "一只橘色小猫",
	image_url: "http://img/cat.png",
	approval_state: "approved",
	approval_version: 1,
};

const shot = {
	id: 1,
	project_id: 7,
	order: 1,
	description: "小猫推开门",
	prompt: "A cat pushes open a door",
	image_prompt: "Orange cat pushing door",
	image_url: "http://img/shot1.png",
	video_url: null,
	duration: 5,
	character_ids: [1],
	approval_state: "approved",
	approval_version: 1,
};

const plan = {
	project_id: 7,
	has_content: true,
	character_count: 1,
	shot_count: 1,
	has_final_video: true,
	stages: ["剧本", "角色", "分镜", "渲染", "合成"],
	estimate: { seconds_low: 180, seconds_high: 480, text_calls: 4, image_calls: 2, video_calls: 1, basis: "heuristic" },
	previous_version: null,
};

function activeRun(runId: number, patch: Record<string, unknown> = {}) {
	return {
		state: "active",
		detail: "运行中",
		available_actions: ["cancel"],
		active_run: { id: runId, project_id: 7, status: "running", current_agent: "plan", progress: 0.2, provider_snapshot: null },
		recovery_summary: { current_stage: "plan", next_stage: null, preserved_stages: [] },
		awaiting_gate: null,
		pending_gate_feedback: null,
		...patch,
	};
}

type Server = {
	project: Record<string, unknown>;
	current: Json;
	messages: Json;
	generateCalls: number;
	cancelCalls: number;
	planWarm: boolean[];
	generateDelayMs: number;
	onCancel?: (server: Server) => void;
};

async function installMockWebSocket(page: Page) {
	await page.addInitScript(() => {
		class MockWebSocket {
			static instances: MockWebSocket[] = [];
			static OPEN = 1;
			static CLOSED = 3;
			url: string;
			readyState = MockWebSocket.OPEN;
			onopen: null | ((event?: Event) => void) = null;
			onmessage: null | ((event: MessageEvent<string>) => void) = null;
			onerror: null | ((event?: Event) => void) = null;
			onclose: null | ((event?: Event) => void) = null;
			constructor(url: string) {
				this.url = url;
				MockWebSocket.instances.push(this);
				queueMicrotask(() => this.onopen?.(new Event("open")));
			}
			send(_data: string) {}
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
}

async function mockApis(page: Page, init: Partial<Server> = {}): Promise<Server> {
	const server: Server = {
		project: project(),
		current: null,
		messages: [],
		generateCalls: 0,
		cancelCalls: 0,
		planWarm: [],
		generateDelayMs: 0,
		...init,
	};
	const characters = () => (server.project.video_url || server.project.summary ? [character] : []);
	const shots = () => (server.project.video_url || server.project.summary ? [shot] : []);

	await page.route("**/api/v1/**", async (route) => {
		const url = new URL(route.request().url());
		const method = route.request().method();
		const path = url.pathname;
		const json = (body: Json, status = 200) =>
			route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });

		if (path === "/api/v1/config" && method === "GET") return json([]);
		if (path === "/api/v1/projects" && method === "GET") return json({ items: [server.project], total: 1 });
		if (path === "/api/v1/projects/7" && method === "GET") return json(server.project);
		if (path === "/api/v1/projects/7/characters") return json(characters());
		if (path === "/api/v1/projects/7/shots") return json(shots());
		if (path === "/api/v1/projects/7/messages") return json(server.messages);
		if (path === "/api/v1/projects/7/runs/current") return json(server.current);
		if (path === "/api/v1/projects/7/runs/regenerate-plan") {
			server.planWarm.push(url.searchParams.get("warm") === "true");
			return json(plan);
		}
		if (path === "/api/v1/projects/7/runs" && method === "POST") {
			server.generateCalls += 1;
			if (server.generateDelayMs) await new Promise((r) => setTimeout(r, server.generateDelayMs));
			server.current = activeRun(950);
			return json({ id: 950, project_id: 7, status: "running", current_agent: "plan", progress: 0, provider_snapshot: null });
		}
		if (/^\/api\/v1\/runs\/\d+\/cancel$/.test(path) && method === "POST") {
			server.cancelCalls += 1;
			server.current = null;
			server.onCancel?.(server);
			return json({ status: "cancelled", cancelled: 1, run_ids: [Number(path.split("/")[4])] });
		}
		if (path === "/api/v1/projects/7/final-video") {
			return route.fulfill({ status: 200, contentType: "video/mp4", body: "fake" });
		}
		return json({ error: { message: `Unhandled route: ${method} ${path}` } }, 404);
	});
	return server;
}

async function openActivity(page: Page) {
	const pill = page.getByRole("button", { name: "展开活动面板" });
	if (await pill.isVisible()) await pill.click();
	await expect(page.locator("aside[aria-label='工作流活动']")).toBeVisible();
}

async function dispatch(page: Page, event: Record<string, unknown>) {
	await page.evaluate((frame) => window.__mockWs.dispatch(frame), event);
}

test.beforeEach(async ({ page }) => {
	await installMockWebSocket(page);
});

test("重新生成 lives in the ··· menu behind a confirm dialog with time, cost and what is kept", async ({ page }) => {
	const server = await mockApis(page, { project: project({ video_url: "/static/final.mp4" }) });
	await page.goto("/project/7");
	await page.waitForLoadState("networkidle");

	// 成片已出：主按钮是下载成片，不再是一键重新生成
	await expect(page.getByRole("banner").getByRole("link", { name: "下载成片" })).toBeVisible();
	await expect(page.getByRole("button", { name: "重新生成", exact: true })).toHaveCount(0);

	await page.getByRole("button", { name: "工作台工具" }).click();
	await page.getByRole("menuitem", { name: "重新生成（先确认）" }).click();

	const dialog = page.getByTestId("regenerate-dialog");
	await expect(dialog).toBeVisible();
	await expect(dialog).toContainText("剧本 → 角色 → 分镜 → 渲染 → 合成");
	await expect(dialog).toContainText("约 3–8 分钟");
	await expect(dialog).toContainText("按模型服务计费");
	await expect(page.getByTestId("regenerate-keeps-previous")).toContainText("会保留为上一版");
	expect(server.planWarm).toContain(true);

	// 取消不会开跑
	await dialog.getByRole("button", { name: "取消" }).click();
	await expect(dialog).toHaveCount(0);
	expect(server.generateCalls).toBe(0);

	await page.getByRole("button", { name: "工作台工具" }).click();
	await page.getByRole("menuitem", { name: "重新生成（先确认）" }).click();
	await page.getByTestId("regenerate-dialog").getByRole("button", { name: "重新生成" }).click();
	await expect.poll(() => server.generateCalls).toBe(1);
});

test("开始生成 shows a busy button and a timeline placeholder until the run exists", async ({ page }) => {
	const server = await mockApis(page, { project: project({ summary: null }), generateDelayMs: 1500 });
	await page.goto("/project/7");
	await page.waitForLoadState("networkidle");
	await openActivity(page);

	await page.getByRole("button", { name: "开始生成" }).click();
	const busy = page.getByRole("button", { name: /正在创建/ });
	await expect(busy).toBeVisible();
	await expect(busy).toBeDisabled();
	await expect(page.getByTestId("run-starting")).toContainText("正在创建运行");

	await expect.poll(() => server.generateCalls).toBe(1);
	await expect(page.getByTestId("run-starting")).toHaveCount(0);
	await expect(page.getByRole("button", { name: /正在创建/ })).toHaveCount(0);
});

test("停止 puts the project back to its last finished cut instead of a resumable plan", async ({ page }) => {
	const server = await mockApis(page, {
		project: project({ video_url: null }),
		current: activeRun(950),
		onCancel: (s) => {
			// 服务端把重新生成之前的成片和画布放回去
			s.project = project({ video_url: "/static/final.mp4" });
		},
	});
	await page.goto("/project/7");
	await page.waitForLoadState("networkidle");

	await page.getByRole("button", { name: "停止", exact: true }).first().click();
	await expect.poll(() => server.cancelCalls).toBe(1);
	await dispatch(page, { type: "project_restored", data: { project_id: 7, run_id: 950, reason: "stopped" } });

	await expect(page.getByRole("banner").getByRole("link", { name: "下载成片" })).toBeVisible();
	await expect(page.getByRole("button", { name: /^状态：/ })).toContainText("成片可用");
	await expect(page.getByText(/可恢复/)).toHaveCount(0);
	await expect(page.getByText(/运行中断于/)).toHaveCount(0);
	await openActivity(page);
	await expect(page.getByText(/项目放回了重新生成之前的版本/)).toBeVisible();
});

test("the interruption card names the gate, speaks Chinese, and 取消 clears it for good", async ({ page }) => {
	const server = await mockApis(page, {
		current: {
			state: "recoverable",
			detail: "运行中断",
			available_actions: ["resume", "cancel"],
			active_run: {
				id: 960,
				project_id: 7,
				status: "failed",
				current_agent: "shots",
				progress: 0.4,
				error: "run lease expired",
				provider_snapshot: null,
			},
			recovery_summary: { current_stage: "shots_approval", next_stage: "shots_approval", preserved_stages: ["plan", "characters"] },
			awaiting_gate: null,
			pending_gate_feedback: null,
		},
	});
	await page.goto("/project/7");
	await page.waitForLoadState("networkidle");
	await openActivity(page);

	await expect(page.getByText("运行中断于分镜脚本确认")).toBeVisible();
	await expect(page.getByText("运行中断于渲染阶段")).toHaveCount(0);
	await expect(page.getByText(/引擎租约过期/)).toBeVisible();
	const raw = page.getByText("run lease expired");
	await expect(raw).toBeHidden();
	await page.getByText("详细信息").click();
	await expect(raw).toBeVisible();

	await page.getByRole("button", { name: "取消", exact: true }).click();
	await expect.poll(() => server.cancelCalls).toBe(1);
	await expect(page.getByText("运行中断于分镜脚本确认")).toHaveCount(0);

	await page.reload();
	await page.waitForLoadState("networkidle");
	await openActivity(page);
	await expect(page.getByText(/运行中断于/)).toHaveCount(0);
});

test("feedback receipts survive a reload and sit before the redo output", async ({ page }) => {
	const row = (id: number, role: string, content: string, summary: string | null = null, agent = "outline") => ({
		id,
		project_id: 7,
		run_id: 970,
		agent,
		role,
		content,
		summary,
		progress: null,
		is_loading: false,
		created_at: `2026-05-05T00:00:0${id}.000Z`,
	});
	await mockApis(page, {
		messages: [
			row(1, "user", "结局更温暖一些"),
			row(
				2,
				"feedback_receipt",
				JSON.stringify({ id: "fb1", round: 1, state: "revised", content: "结局更温暖一些", stage: "outline_approval", gate: "outline" }),
				"fb1",
			),
			row(3, "assistant", "已按意见重写大纲：结局改为小猫找到了主人。"),
		],
	});
	await page.goto("/project/7");
	await page.waitForLoadState("networkidle");
	await openActivity(page);

	const receipt = page.getByTestId("feedback-receipt");
	await expect(receipt).toBeVisible();
	await expect(receipt).toContainText("结局更温暖一些");
	const redo = page.getByText("已按意见重写大纲", { exact: false });
	await expect(redo).toBeVisible();
	const [receiptBox, redoBox] = await Promise.all([receipt.boundingBox(), redo.boundingBox()]);
	expect(receiptBox && redoBox && receiptBox.y < redoBox.y).toBe(true);
});
