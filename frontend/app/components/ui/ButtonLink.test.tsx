import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { Button, buttonClass } from "./Button";
import { ButtonLink } from "./ButtonLink";

describe("ButtonLink", () => {
	it("renders one link with button styling and no nested button", () => {
		render(
			<MemoryRouter>
				<ButtonLink to="/universes" size="sm" variant="ghost">
					返回
				</ButtonLink>
			</MemoryRouter>,
		);
		const link = screen.getByRole("link", { name: "返回" });
		expect(link).toHaveAttribute("href", "/universes");
		expect(link.querySelector("button")).toBeNull();
		expect(screen.queryByRole("button")).toBeNull();
		for (const cls of buttonClass({ variant: "ghost", size: "sm" }).split(/\s+/)) {
			expect(link).toHaveClass(cls);
		}
	});

	it("uses the same classes as a Button of the same variant and size", () => {
		render(
			<MemoryRouter>
				<Button size="sm">同款</Button>
				<ButtonLink to="/" size="sm">同款</ButtonLink>
			</MemoryRouter>,
		);
		expect(screen.getByRole("link").className).toBe(screen.getByRole("button").className);
	});

	it("keeps extra classes and link props", () => {
		render(
			<MemoryRouter>
				<ButtonLink to="/x" className="w-full" aria-label="去 X" />
			</MemoryRouter>,
		);
		const link = screen.getByRole("link", { name: "去 X" });
		expect(link).toHaveClass("w-full", "btn-doodle");
	});
});
