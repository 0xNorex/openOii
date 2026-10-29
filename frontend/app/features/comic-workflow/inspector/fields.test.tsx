import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ActionButton } from "./fields";

describe("ActionButton", () => {
	it("renders a danger action as red text on a quiet background, never red on red", () => {
		render(<ActionButton icon="trash-2" label="删除" danger onClick={vi.fn()} />);
		const button = screen.getByRole("button", { name: "删除" });
		expect(button.className).toContain("text-error-fg");
		expect(button.className).not.toContain("bg-error ");
	});
});
