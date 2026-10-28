import { expect, test } from "@playwright/test";

// Dialogs render in the browser top layer, so nothing on the workbench
// (inspector, canvas chrome) can sit above the settings form.
for (const viewport of [
	{ width: 1440, height: 900 },
	{ width: 390, height: 844 },
]) {
	test(`settings save button is on top at ${viewport.width}x${viewport.height}`, async ({ page, request }) => {
		const projects = await (await request.get("http://127.0.0.1:18765/api/v1/projects")).json();
		test.skip(!projects.items?.length, "needs a project in the dev database");

		await page.setViewportSize(viewport);
		await page.goto(`/project/${projects.items[0].id}`);
		await page.getByRole("button", { name: "设置" }).first().click();

		const dialog = page.getByRole("dialog", { name: /系统设置/ });
		await expect(dialog).toBeVisible();
		const save = dialog.getByRole("button", { name: /保存配置/ });
		await save.scrollIntoViewIfNeeded();
		await expect(save).toBeVisible();

		const onTop = await save.evaluate((button) => {
			const rect = button.getBoundingClientRect();
			const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
			return !!hit && button.contains(hit);
		});
		expect(onTop).toBe(true);
	});
}
