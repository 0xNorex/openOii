import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AgentPanel } from "./AgentPanel";

vi.mock("~/components/chat/ChatPanel", () => ({
	ChatPanel: () => <div data-testid="chat-panel" />,
}));

const base = {
	projectId: 1,
	onConfirm: vi.fn(),
	onCancel: vi.fn(),
	isGenerating: false,
};

describe("AgentPanel", () => {
	it("floats over the canvas and collapses into a pill", async () => {
		const onCollapsedChange = vi.fn();
		render(<AgentPanel {...base} collapsed={false} onCollapsedChange={onCollapsedChange} />);

		expect(screen.getByRole("complementary", { name: "工作流活动" })).toBeInTheDocument();
		expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
		await userEvent.click(screen.getByRole("button", { name: "收起活动面板" }));
		expect(onCollapsedChange).toHaveBeenCalledWith(true);
	});

	it("shows pending work on the collapsed pill", async () => {
		const onCollapsedChange = vi.fn();
		render(
			<AgentPanel {...base} collapsed onCollapsedChange={onCollapsedChange} pendingCount={2} />,
		);

		expect(screen.queryByTestId("chat-panel")).not.toBeInTheDocument();
		const pill = screen.getByRole("button", { name: "展开活动面板" });
		expect(pill).toHaveTextContent("2");
		await userEvent.click(pill);
		expect(onCollapsedChange).toHaveBeenCalledWith(false);
	});

	it("renders inline on mobile without a collapse control", () => {
		render(<AgentPanel {...base} inline collapsed onCollapsedChange={vi.fn()} />);

		expect(screen.getByTestId("chat-panel")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "收起活动面板" })).not.toBeInTheDocument();
	});
});
