import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { canvasEvents } from "~/components/canvas/canvasEvents";
import type { Character, Shot } from "~/types";
import { KeyboardLayer } from "./KeyboardLayer";

vi.mock("~/services/api", () => ({
	projectsApi: { list: vi.fn().mockResolvedValue([{ id: 2, title: "另一个项目" }]) },
}));

const shots = [
	{ id: 10, order: 2, description: "雨夜推门" },
	{ id: 11, order: 1, description: "书店门口" },
] as Shot[];
const characters = [{ id: 1, name: "林夏", description: "店主" }] as Character[];

function renderLayer() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={client}>
			<MemoryRouter>
				<KeyboardLayer projectId={1} shots={shots} characters={characters} />
			</MemoryRouter>
		</QueryClientProvider>,
	);
}

describe("KeyboardLayer", () => {
	it("opens the shortcut sheet on ?", async () => {
		const user = userEvent.setup();
		renderLayer();
		await user.keyboard("?");
		expect(screen.getByRole("heading", { name: "键盘快捷键" })).toBeInTheDocument();
	});

	it("jumps to a shot from the command palette", async () => {
		const user = userEvent.setup();
		const seen = vi.fn();
		const off = canvasEvents.on("focus-workflow-node", seen);
		renderLayer();
		await user.keyboard("{Control>}k{/Control}");
		const input = screen.getByRole("combobox", { name: "搜索分镜、角色或项目" });
		expect(screen.getAllByRole("option")[0]).toHaveTextContent("S01");
		await user.type(input, "推门");
		expect(screen.getAllByRole("option")).toHaveLength(1);
		await user.keyboard("{Enter}");
		expect(seen).toHaveBeenCalledWith({ nodeId: "shot:10" });
		off();
	});

	it("lists other projects to switch to", async () => {
		const user = userEvent.setup();
		renderLayer();
		await user.keyboard("{Control>}k{/Control}");
		expect(await screen.findByRole("option", { name: /另一个项目/ })).toBeInTheDocument();
	});
});
