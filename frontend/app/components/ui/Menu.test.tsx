import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MenuButton, MenuItem } from "./Menu";

function renderMenu(onA = vi.fn()) {
	render(
		<div>
			<MenuButton label="更多" menuLabel="更多菜单">
				<MenuItem onClick={onA}>甲</MenuItem>
				<MenuItem disabled>乙</MenuItem>
				<MenuItem>丙</MenuItem>
			</MenuButton>
			<p>外面</p>
		</div>,
	);
	return onA;
}

describe("MenuButton", () => {
	it("focuses the first item, moves with arrows (skipping disabled) and wraps", async () => {
		const user = userEvent.setup();
		renderMenu();
		const trigger = screen.getByRole("button", { name: "更多" });
		await user.click(trigger);
		expect(trigger).toHaveAttribute("aria-expanded", "true");
		expect(screen.getByRole("menuitem", { name: "甲" })).toHaveFocus();
		await user.keyboard("{ArrowDown}");
		expect(screen.getByRole("menuitem", { name: "丙" })).toHaveFocus();
		await user.keyboard("{ArrowDown}");
		expect(screen.getByRole("menuitem", { name: "甲" })).toHaveFocus();
		await user.keyboard("{End}");
		expect(screen.getByRole("menuitem", { name: "丙" })).toHaveFocus();
	});

	it("gives items a pressed tint instead of a scale, and none when disabled", async () => {
		const user = userEvent.setup();
		renderMenu();
		await user.click(screen.getByRole("button", { name: "更多" }));
		const item = screen.getByRole("menuitem", { name: "甲" });
		expect(item).toHaveClass("active:bg-ink/10", "duration-press");
		expect(item).not.toHaveClass("press");
		expect(screen.getByRole("menuitem", { name: "乙" })).toHaveClass("disabled:active:bg-transparent");
	});

	it("closes on Escape and returns focus to the trigger", async () => {
		const user = userEvent.setup();
		renderMenu();
		const trigger = screen.getByRole("button", { name: "更多" });
		await user.click(trigger);
		await user.keyboard("{Escape}");
		expect(screen.queryByRole("menu")).toBeNull();
		expect(trigger).toHaveFocus();
	});

	it("closes after choosing an item and on outside pointerdown", async () => {
		const user = userEvent.setup();
		const onA = renderMenu();
		await user.click(screen.getByRole("button", { name: "更多" }));
		await user.click(screen.getByRole("menuitem", { name: "甲" }));
		expect(onA).toHaveBeenCalledTimes(1);
		expect(screen.queryByRole("menu")).toBeNull();
		await user.click(screen.getByRole("button", { name: "更多" }));
		await user.click(screen.getByText("外面"));
		expect(screen.queryByRole("menu")).toBeNull();
	});
});
