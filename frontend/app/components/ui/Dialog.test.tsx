import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { Dialog } from "./Dialog";

describe("Dialog", () => {
	it("opens as a native modal dialog named by its title", () => {
		render(
			<Dialog open onClose={vi.fn()} labelledBy="t">
				<h2 id="t">标题</h2>
			</Dialog>,
		);
		const dialog = screen.getByRole("dialog", { name: "标题" });
		expect(dialog.tagName).toBe("DIALOG");
		expect(dialog).toHaveAttribute("open");
	});

	it("closes on Escape and backdrop click unless told not to", () => {
		const onClose = vi.fn();
		const { rerender } = render(
			<Dialog open onClose={onClose}>
				body
			</Dialog>,
		);
		fireEvent.keyDown(document, { key: "Escape" });
		fireEvent.click(screen.getByRole("dialog"));
		fireEvent.click(screen.getByText("body"));
		expect(onClose).toHaveBeenCalledTimes(2);

		onClose.mockClear();
		rerender(
			<Dialog open onClose={onClose} closeOnBackdrop={false}>
				body
			</Dialog>,
		);
		fireEvent.click(screen.getByRole("dialog"));
		expect(onClose).not.toHaveBeenCalled();
		fireEvent.keyDown(document, { key: "Escape" });
		expect(onClose).toHaveBeenCalledTimes(1);

		onClose.mockClear();
		rerender(
			<Dialog open onClose={onClose} dismissible={false}>
				body
			</Dialog>,
		);
		fireEvent.keyDown(document, { key: "Escape" });
		fireEvent.click(screen.getByRole("dialog"));
		expect(onClose).not.toHaveBeenCalled();
	});

	it("returns focus to the opener when it closes", () => {
		function Harness() {
			const [open, setOpen] = useState(false);
			return (
				<>
					<button onClick={() => setOpen(true)}>打开</button>
					<Dialog open={open} onClose={() => setOpen(false)}>
						<button onClick={() => setOpen(false)}>完成</button>
					</Dialog>
				</>
			);
		}
		render(<Harness />);
		const opener = screen.getByRole("button", { name: "打开" });
		opener.focus();
		fireEvent.click(opener);
		fireEvent.click(screen.getByRole("button", { name: "完成" }));
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		expect(opener).toHaveFocus();
	});
});
