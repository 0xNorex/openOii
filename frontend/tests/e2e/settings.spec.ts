import { expect, test, type Page, type Request } from "@playwright/test";

/**
 * 设置页 e2e：配置接口全部 mock，绝不读写真实配置。
 * 密钥只有脱敏占位值（不是任何真实密钥）。
 */
type Item = { key: string; value: string | null; is_sensitive: boolean; is_masked: boolean; source: "db" | "env" | "default" };
const item = (key: string, value: string | null, sensitive = false): Item => ({
	key,
	value,
	is_sensitive: sensitive,
	is_masked: sensitive,
	source: "db",
});

export const LOCAL_GATEWAY_CONFIG: Item[] = [
	item("TEXT_PROVIDER", "openai"),
	item("TEXT_BASE_URL", "http://127.0.0.1:18790/v1"),
	item("TEXT_ENDPOINT", "/chat/completions"),
	item("TEXT_MODEL", "muse-spark"),
	item("TEXT_API_KEY", "sk-****", true),
	item("TEXT_ENABLE_THINKING", "false"),
	item("TEXT_REASONING_EFFORT", ""),
	item("ANTHROPIC_BASE_URL", ""),
	item("ANTHROPIC_MODEL", "claude-sonnet-4-5-20250929"),
	item("ANTHROPIC_AUTH_TOKEN", "****", true),
	item("FAKE_TEXT_RESPONSE", "fake"),
	item("IMAGE_PROVIDER", "openai"),
	item("IMAGE_BASE_URL", "http://127.0.0.1:18790"),
	item("IMAGE_ENDPOINT", "/v1/images/generations"),
	item("IMAGE_MODEL", "muse-image"),
	item("IMAGE_API_KEY", "sk-****", true),
	item("ENABLE_IMAGE_TO_IMAGE", "true"),
	item("VIDEO_PROVIDER", "openai"),
	item("VIDEO_BASE_URL", "http://127.0.0.1:18790"),
	item("VIDEO_ENDPOINT", "/v1/videos/generations"),
	item("VIDEO_MODEL", "muse-video"),
	item("VIDEO_API_KEY", "sk-****", true),
	item("DOUBAO_API_KEY", "****", true),
	item("DOUBAO_VIDEO_MODEL", "doubao-seedance-1-5-pro-251215"),
	item("DOUBAO_VIDEO_DURATION", "5"),
	item("DOUBAO_VIDEO_RATIO", "adaptive"),
	item("ENABLE_IMAGE_TO_VIDEO", "true"),
	item("LOG_LEVEL", "INFO"),
];

export async function mockConfig(
	page: Page,
	opts: { testResponse?: Record<string, unknown>; onTest?: (req: Request) => void; onSave?: (req: Request) => void } = {},
) {
	await page.route("**/api/v1/config**", (route) => {
		const req = route.request();
		const path = new URL(req.url()).pathname;
		if (path === "/api/v1/config/test-connection") {
			opts.onTest?.(req);
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify(opts.testResponse ?? { success: true, message: "连接成功", details: "", status: "valid" }),
			});
		}
		if (path === "/api/v1/config" && req.method() === "GET") {
			return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(LOCAL_GATEWAY_CONFIG) });
		}
		if (path === "/api/v1/config") {
			opts.onSave?.(req);
			return route.fulfill({
				status: 200,
				contentType: "application/json",
				body: JSON.stringify({ updated: 0, skipped: 0, restart_required: false, restart_keys: [], message: "ok" }),
			});
		}
		return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
	});
}

export async function openSettings(page: Page) {
	await page.goto("/");
	await page.getByRole("button", { name: "设置", exact: true }).click();
	await expect(page.getByRole("dialog", { name: /系统设置/ })).toBeVisible();
}

test("测试连接 sends the saved local gateway URL and shows the Chinese failure reason", async ({ page }) => {
	const bodies: Array<Record<string, unknown>> = [];
	await mockConfig(page, {
		testResponse: {
			success: false,
			status: "invalid",
			message: "API Key 无效",
			details: "服务返回 401：密钥填错、已过期，或与所选地域不匹配。",
		},
		onTest: (req) => bodies.push(req.postDataJSON() as Record<string, unknown>),
	});
	await openSettings(page);
	await page.getByRole("tab", { name: /文本/ }).click();
	await page.getByRole("button", { name: "测试连接" }).click();

	await expect(page.getByText("API Key 无效")).toBeVisible();
	await expect(page.getByText(/与所选地域不匹配/)).toBeVisible();
	expect(bodies).toHaveLength(1);
	expect(bodies[0]!.service).toBe("llm");
	const overrides = bodies[0]!.config_overrides as Record<string, string>;
	expect(overrides.TEXT_BASE_URL).toBe("http://127.0.0.1:18790/v1");
	// 脱敏占位值原样回传，由后端忽略，不会被当成新密钥
	expect(overrides.TEXT_API_KEY).toContain("***");
});
