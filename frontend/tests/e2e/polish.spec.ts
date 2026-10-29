import { expect, test, type Page } from "@playwright/test";

const project = (id: number, status: string) => ({
	id,
	title: `项目 ${id}`,
	story: "灯塔管理员发现会发光的地图。",
	style: "cinematic",
	summary: null,
	video_url: null,
	status,
	target_shot_count: null,
	character_hints: [],
	creation_mode: null,
	reference_images: [],
	created_at: "2026-10-01T00:00:00Z",
	updated_at: "2026-10-01T00:00:00Z",
});

async function mockProjects(page: Page) {
	await page.route("**/api/v1/projects*", (route) => {
		const url = new URL(route.request().url());
		if (url.pathname !== "/api/v1/projects" || route.request().method() !== "GET") return route.fallback();
		const items = [project(1, "active"), project(2, "ready"), project(3, "ready")];
		return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ items, total: items.length }) });
	});
}

/** 交互元素里不能再有交互元素（<a><button> 等）。 */
async function nestedInteractive(page: Page) {
	return page.evaluate(() => {
		const sel = "a[href], button, select, textarea, summary, [role=button], [role=menuitem], [role=link]";
		return Array.from(document.querySelectorAll<HTMLElement>(sel))
			.filter((el) => el.parentElement?.closest(sel))
			.map((el) => `${el.tagName} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 20)}"`);
	});
}

async function scaleWhileHeld(page: Page, locator: ReturnType<Page["locator"]>) {
	const box = await locator.boundingBox();
	if (!box) throw new Error("not visible");
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	// 按压过渡 120ms，轮询到稳定值
	let scale = 1;
	await expect
		.poll(async () => {
			scale = await locator.evaluate((el) => {
				const t = getComputedStyle(el).transform;
				return t === "none" ? 1 : new DOMMatrixReadOnly(t).a;
			});
			return scale;
		}, { timeout: 2000 })
		.not.toBeGreaterThan(0.995);
	await page.mouse.up();
	return scale;
}

test.describe("polish pass", () => {
	for (const path of ["/", "/projects", "/universes"]) {
		test(`no interactive element nested inside another on ${path}`, async ({ page }) => {
			await mockProjects(page);
			await page.goto(path);
			await page.waitForLoadState("networkidle");
			expect(await nestedInteractive(page)).toEqual([]);
		});
	}

	test("projects header carries the counts as meta and 新建 is a plain link", async ({ page }) => {
		await mockProjects(page);
		await page.goto("/projects");
		await expect(page.getByText("3 个 · 2 部成片")).toBeVisible();
		const create = page.getByRole("link", { name: "新建", exact: true });
		await expect(create).toHaveAttribute("href", "/");
		await expect(create.locator("button")).toHaveCount(0);
		await create.click();
		await expect(page).toHaveURL(/\/$/);
	});

	test("home mode cards are roomy and press down slightly", async ({ page }) => {
		await page.goto("/");
		const card = page.getByRole("button", { name: /自动确认/ });
		const metrics = await card.evaluate((el) => {
			const s = getComputedStyle(el);
			return { height: el.getBoundingClientRect().height, top: parseFloat(s.paddingTop), bottom: parseFloat(s.paddingBottom) };
		});
		expect(metrics.height).toBeGreaterThanOrEqual(56);
		expect(metrics.top).toBeGreaterThanOrEqual(10);
		expect(metrics.bottom).toBeGreaterThanOrEqual(10);
		const scale = await scaleWhileHeld(page, card);
		expect(scale).toBeCloseTo(0.98, 2);
	});

	test("reduced motion keeps the press colour but drops the scale", async ({ page }) => {
		await page.emulateMedia({ reducedMotion: "reduce" });
		await page.goto("/");
		const card = page.getByRole("button", { name: /自动确认/ });
		const box = await card.boundingBox();
		if (!box) throw new Error("not visible");
		await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
		await page.mouse.down();
		await page.waitForTimeout(200);
		expect(await card.evaluate((el) => getComputedStyle(el).transform)).toBe("none");
		await page.mouse.up();
		const start = page.getByRole("button", { name: "开始创作" });
		expect(await start.evaluate((el) => getComputedStyle(el).transform)).toBe("none");
	});
});
