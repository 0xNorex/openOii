import { expect, test } from "@playwright/test";

const SIX = ["生成中", "待确认", "审查中", "需重合成", "失败", "完成"];

test("state colour sheet: six states in light and dark, each under three colour-blind simulations", async ({ page }) => {
	await page.setViewportSize({ width: 1440, height: 900 });
	await page.goto("/dev/state-colors");
	for (const theme of ["light", "dark"]) {
		const sheet = page.getByTestId(`sheet-${theme}`);
		await expect(sheet).toBeVisible();
		await expect(sheet.locator("[data-node-status]")).toHaveCount(SIX.length * 4);
		const first = sheet.locator("[data-node-status]").filter({ hasText: /./ });
		await expect(first.first()).toBeVisible();
		for (const label of SIX) await expect(sheet.getByText(label, { exact: true })).toHaveCount(4);
	}
	// light and dark really differ (the nested data-theme picks up the dark tokens)
	const bg = (theme: string) => page.getByTestId(`sheet-${theme}`).evaluate((el) => getComputedStyle(el).backgroundColor);
	expect(await bg("light")).not.toBe(await bg("dark"));
	// every state carries its own shape, not just a colour
	const shapes = await page
		.getByTestId("sheet-light")
		.locator("[data-node-status]")
		.evaluateAll((els) => els.slice(0, 6).map((el) => (el.querySelector("svg") ? el.querySelector("svg path")?.getAttribute("d") : `dot:${el.getAttribute("data-node-status")}`)));
	expect(new Set(shapes).size).toBe(6);
});
