import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import {
	getStudioStatusMeta,
	type StudioStatus,
	type StudioStatusState,
} from "~/features/comic-workflow/state/deriveStudioStatus";
import { StudioControls } from "./StudioControls";

function renderControls(props: Partial<Parameters<typeof StudioControls>[0]> = {}) {
	return render(
		<StudioControls
			isGenerating={false}
			studioStatus={getStudioStatusMeta("idle")}
			awaitingConfirm={false}
			hasRecovery={false}
			onGenerate={vi.fn()}
			onCancel={vi.fn()}
			{...props}
		/>,
	);
}

const pill = () => screen.getByRole("button", { name: /^状态：/ });

describe("StudioControls", () => {
	it.each<[StudioStatusState, string]>([
		["idle", "待启动"],
		["ready", "成片可用"],
		["failed", getStudioStatusMeta("failed").label],
		["cancelled", getStudioStatusMeta("cancelled").label],
	])("shows the %s status label in the pill", (state, label) => {
		renderControls({ studioStatus: getStudioStatusMeta(state) });
		expect(pill()).toHaveTextContent(label);
		expect(screen.getByText(`工作台状态：${label}`)).toBeInTheDocument();
	});

	it("makes 下载成片 the primary action once the final cut exists", () => {
		renderControls({ studioStatus: getStudioStatusMeta("ready"), downloadUrl: "http://x/final.mp4" });
		const download = screen.getByRole("link", { name: "下载成片" });
		expect(download).toHaveAttribute("target", "_blank");
		expect(download.className).toContain("bg-primary");
		expect(screen.getByRole("button", { name: "重新生成" }).className).not.toContain("bg-primary");
	});

	it("names the stage and progress while generating, with a stop action", async () => {
		const user = userEvent.setup();
		const onCancel = vi.fn();
		const status: StudioStatus = { ...getStudioStatusMeta("generating"), stage: "render", progress: 0.42 };
		renderControls({ isGenerating: true, studioStatus: status, onCancel });

		expect(pill()).toHaveTextContent("生成中 · 渲染 · 42%");
		expect(screen.queryByRole("button", { name: /开始生成|重新生成/ })).toBeNull();
		await user.click(screen.getByRole("button", { name: "停止" }));
		expect(onCancel).toHaveBeenCalledTimes(1);
	});

	it("offers the right generate label per state", () => {
		const { rerender } = renderControls();
		expect(screen.getByRole("button", { name: "开始生成" })).toBeEnabled();
		rerender(
			<StudioControls isGenerating={false} studioStatus={getStudioStatusMeta("ready")} awaitingConfirm={false} hasRecovery={false} onGenerate={vi.fn()} onCancel={vi.fn()} />,
		);
		expect(screen.getByRole("button", { name: "重新生成" })).toBeInTheDocument();
		rerender(
			<StudioControls isGenerating={false} studioStatus={getStudioStatusMeta("failed")} awaitingConfirm={false} hasRecovery={false} onGenerate={vi.fn()} onCancel={vi.fn()} />,
		);
		expect(screen.getByRole("button", { name: "重新生成" })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "重试失败阶段" })).toBeNull();
	});

	it("leaves resume and cancel to the inbox for a recoverable run", () => {
		renderControls({ hasRecovery: true, studioStatus: getStudioStatusMeta("recoverable") });
		expect(screen.queryByRole("button", { name: "恢复" })).toBeNull();
		expect(screen.queryByRole("button", { name: "停止当前任务" })).toBeNull();
		expect(screen.queryByRole("button", { name: "开始生成" })).toBeNull();
	});

	it("opens the inbox from the pill and highlights it while awaiting confirmation", async () => {
		const user = userEvent.setup();
		const onOpenInbox = vi.fn();
		renderControls({ awaitingConfirm: true, studioStatus: getStudioStatusMeta("awaitingConfirm"), onOpenInbox });

		expect(pill()).toHaveClass("bg-primary");
		expect(pill()).toHaveAttribute("title", "正在等待创作者确认后继续");
		expect(screen.queryByRole("button", { name: /开始生成|重新生成/ })).toBeNull();
		await user.click(pill());
		expect(onOpenInbox).toHaveBeenCalledTimes(1);
	});

	it("exposes versions and export through the tools menu", async () => {
		const user = userEvent.setup();
		const onOpenVersions = vi.fn();
		const onExport = vi.fn();
		renderControls({ onOpenVersions, onExport });

		const trigger = screen.getByRole("button", { name: "工作台工具" });
		await user.click(trigger);
		await user.click(screen.getByRole("menuitem", { name: "打开版本对比" }));
		await user.click(trigger);
		await user.click(screen.getByRole("menuitem", { name: "导出 Webtoon 长图" }));

		expect(onOpenVersions).toHaveBeenCalledTimes(1);
		expect(onExport).toHaveBeenCalledTimes(1);
	});

	it("omits the tools menu without handlers and disables export while generating", async () => {
		const user = userEvent.setup();
		const { unmount } = renderControls();
		expect(screen.queryByRole("button", { name: "工作台工具" })).toBeNull();
		unmount();

		const onExport = vi.fn();
		renderControls({ onExport, isGenerating: true, studioStatus: getStudioStatusMeta("generating") });
		await user.click(screen.getByRole("button", { name: "工作台工具" }));
		const exportItem = screen.getByRole("menuitem", { name: "导出 Webtoon 长图" });
		expect(exportItem).toBeDisabled();
		await user.click(exportItem);
		expect(onExport).not.toHaveBeenCalled();
	});
});
