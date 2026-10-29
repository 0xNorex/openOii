import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { projectsApi } from "~/services/api";
import { ComicCanvasToolbar } from "./ComicCanvasToolbar";

const controls = {
	tool: "select" as const,
	setTool: vi.fn(),
	zoomPercent: 100,
	zoomIn: vi.fn(),
	zoomOut: vi.fn(),
	zoomReset: vi.fn(),
	fit: vi.fn(),
};

vi.mock("~/services/api", () => ({
	projectsApi: {
		fillEmptyShots: vi.fn(),
	},
}));

vi.mock("~/utils/toast", () => ({
	toast: {
		info: vi.fn(),
		success: vi.fn(),
		error: vi.fn(),
	},
}));

function renderToolbar(overrides = {}) {
	return render(
		<ComicCanvasToolbar
			projectId={15}
			onResetLayout={vi.fn()}
			controls={controls}
			{...overrides}
		/>,
	);
}

describe("ComicCanvasToolbar", () => {
	it("uses the dropdown z token and only shows alongside the canvas (lg+)", () => {
		renderToolbar();

		const toolbar = screen.getByRole("toolbar", { name: "画布工具栏" });
		// 不再裸写 z-50 压住 z-20 的抽屉；<lg 跟随画布一起不显示
		expect(toolbar.className).toContain("z-panel");
		expect(toolbar.className).not.toContain("z-50");
		expect(toolbar.className).toContain("hidden");
		expect(toolbar.className).toContain("lg:flex");
	});

	it("does not render the removed consistency evaluation button", () => {
		renderToolbar();

		expect(screen.queryByLabelText("一致性评估")).not.toBeInTheDocument();
	});

	it("does not render shot sorting controls when not provided", () => {
		renderToolbar();

		expect(screen.queryByLabelText("排序九宫格")).not.toBeInTheDocument();
		expect(screen.queryByLabelText("完成分镜排序")).not.toBeInTheDocument();
	});

	it("does not keep export in canvas toolbar (moved to stage chrome)", () => {
		renderToolbar();

		expect(screen.queryByLabelText("导出 Webtoon 长图")).not.toBeInTheDocument();
	});

	it("fills empty first-frame cells", async () => {
		const user = userEvent.setup();
		vi.mocked(projectsApi.fillEmptyShots).mockResolvedValue({
			id: 1,
			project_id: 15,
			status: "queued",
		} as never);
		renderToolbar();

		await user.click(screen.getByRole("button", { name: "更多画布操作" }));
		await user.click(screen.getByRole("menuitem", { name: "补齐空格 · 首帧" }));

		expect(projectsApi.fillEmptyShots).toHaveBeenCalledWith(15, "image");
	});

	// KISS 守卫：常驻按钮 ≤ 9，全部是图标（不再用「3×N / 图 / 视」文字假图标），少用操作进「更多」
	it("keeps at most 9 always-visible controls, each with a real icon", () => {
		renderToolbar({ onOpenAssets: vi.fn(), onToggleSortMode: vi.fn() });
		const toolbar = screen.getByRole("toolbar", { name: "画布工具栏" });
		const buttons = Array.from(toolbar.querySelectorAll("button"));
		expect(buttons.length).toBeLessThanOrEqual(9);
		for (const button of buttons) {
			if (button.getAttribute("aria-label")?.includes("重置缩放")) continue;
			expect(button.querySelector("svg"), button.getAttribute("aria-label") ?? "").not.toBeNull();
		}
		expect(toolbar.textContent).not.toMatch(/3×N|^图$|^视$/);
		// 没有重复入口：排序和补齐只在菜单里
		expect(screen.queryByRole("button", { name: "排序九宫格" })).toBeNull();
		expect(screen.queryByRole("button", { name: "补齐空格 · 视频" })).toBeNull();
	});

	it("puts rare actions in the overflow menu and keeps 完成排序 visible in sort mode", async () => {
		const user = userEvent.setup();
		const onToggleSortMode = vi.fn();
		const { rerender } = renderToolbar({ onToggleSortMode });
		await user.click(screen.getByRole("button", { name: "更多画布操作" }));
		const menu = screen.getByRole("menu", { name: "更多画布操作" });
		expect(menu).toHaveTextContent("排序分镜");
		expect(menu).toHaveTextContent("补齐缺失首帧");
		expect(menu).toHaveTextContent("补齐缺失视频");
		await user.click(screen.getByRole("menuitem", { name: "排序九宫格" }));
		expect(onToggleSortMode).toHaveBeenCalledTimes(1);
		expect(screen.queryByRole("menu")).toBeNull();

		rerender(
			<ComicCanvasToolbar projectId={15} onResetLayout={vi.fn()} controls={controls} sortMode onToggleSortMode={onToggleSortMode} />,
		);
		const done = screen.getByRole("button", { name: "完成分镜排序" });
		expect(done).toHaveAttribute("aria-pressed", "true");
		expect(done).toHaveTextContent("完成排序");
		// 排序中「整理」让位，避免打乱正在拖的顺序
		expect(screen.queryByRole("button", { name: "整理画布" })).toBeNull();
	});

	it("labels the two frequent canvas actions with text at every width", () => {
		renderToolbar({ onOpenAssets: vi.fn() });
		expect(screen.getByRole("button", { name: "整理画布" })).toHaveTextContent("整理");
		expect(screen.getByRole("button", { name: "打开资产库" })).toHaveTextContent("资产");
		expect(screen.getByRole("button", { name: "选择工具" })).toHaveAttribute("aria-keyshortcuts", "V");
	});
});

