import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HowItWorks } from "./HowItWorks";

describe("HowItWorks", () => {
	it("opens for first-time users with three steps and key terms", () => {
		const { container } = render(<HowItWorks defaultOpen />);
		expect(container.querySelector("details")).toHaveAttribute("open");
		expect(screen.getAllByRole("listitem")).toHaveLength(3);
		expect(screen.getByText("待处理")).toBeInTheDocument();
	});

	it("stays collapsed once the user has projects", () => {
		const { container } = render(<HowItWorks defaultOpen={false} />);
		expect(container.querySelector("details")).not.toHaveAttribute("open");
	});
});
