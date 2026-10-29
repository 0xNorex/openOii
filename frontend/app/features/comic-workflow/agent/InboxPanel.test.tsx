import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { InboxPanel } from "./InboxPanel";
import type { InboxItem } from "./inboxItems";

const actions = () => ({
	onConfirm: vi.fn(),
	onRequestChanges: vi.fn(),
	onResume: vi.fn(),
	onCancel: vi.fn(),
	onRetry: vi.fn(),
	onSelectShot: vi.fn(),
});

const gate: InboxItem = { kind: "gate", id: "gate", title: "规划已完成，等待确认", detail: "看看大纲", gate: null };

describe("InboxPanel", () => {
	it("shows an empty state", () => {
		render(<InboxPanel items={[]} actions={actions()} />);
		expect(screen.getByText("没有待处理事项")).toBeInTheDocument();
	});

	it("has exactly one 确认继续 for a gate, and 提修改意见 asks for the prompt bar", async () => {
		const a = actions();
		render(<InboxPanel items={[gate]} actions={a} />);

		const confirm = screen.getAllByRole("button", { name: "确认继续" });
		expect(confirm).toHaveLength(1);
		await userEvent.click(confirm[0]);
		expect(a.onConfirm).toHaveBeenCalledWith();

		await userEvent.click(screen.getByRole("button", { name: "提修改意见" }));
		expect(a.onRequestChanges).toHaveBeenCalledTimes(1);
	});

	it("shows the outline preview without its own confirm button", () => {
		const outlineGate: InboxItem = {
			...gate,
			gate: {
				run_id: 1,
				agent: "outline",
				recovery_summary: {} as never,
				story_outline: { logline: "一句话故事", genre: [], acts: [] } as never,
			},
		};
		render(<InboxPanel items={[outlineGate]} actions={actions()} />);

		expect(screen.getByText("一句话故事")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "确认大纲" })).not.toBeInTheDocument();
		expect(screen.getAllByRole("button", { name: "确认继续" })).toHaveLength(1);
	});

	it("resumes or cancels a recoverable run", async () => {
		const a = actions();
		render(
			<InboxPanel items={[{ kind: "recoverable", id: "recoverable", title: "运行中断", detail: "可继续", resumable: true }]} actions={a} />,
		);
		await userEvent.click(screen.getByRole("button", { name: "继续" }));
		expect(a.onResume).toHaveBeenCalledTimes(1);
		// 取消不可逆：先确认，「先不取消」什么都不发生
		await userEvent.click(screen.getByRole("button", { name: "取消" }));
		await userEvent.click(screen.getByRole("button", { name: "先不取消" }));
		expect(a.onCancel).not.toHaveBeenCalled();
		await userEvent.click(screen.getByRole("button", { name: "取消" }));
		await userEvent.click(screen.getByRole("button", { name: "取消运行" }));
		expect(a.onCancel).toHaveBeenCalledTimes(1);
	});

	it("names the stage on the resume button", () => {
		render(
			<InboxPanel
				items={[{ kind: "recoverable", id: "recoverable", title: "运行中断于分镜脚本确认", detail: "可继续", resumable: true, stageName: "分镜脚本确认" }]}
				actions={actions()}
			/>,
		);
		expect(screen.getByRole("button", { name: "从分镜脚本确认继续" })).toBeInTheDocument();
	});

	it("shows what the gate reviews as thumbnails that focus the canvas", async () => {
		const a = { ...actions(), onFocusNode: vi.fn() };
		render(
			<InboxPanel
				items={[
					{
						...gate,
						previews: [
							{ nodeId: "character:1", label: "小曦", imageUrl: "/static/a.png" },
							{ nodeId: "character:2", label: "店员", imageUrl: null },
						],
					},
				]}
				actions={a}
			/>,
		);
		expect(screen.getByRole("img", { name: "小曦" })).toBeInTheDocument();
		await userEvent.click(screen.getByRole("button", { name: /店员/ }));
		expect(a.onFocusNode).toHaveBeenCalledWith("character:2");
	});

	it("lists names instead of empty image boxes on a text-only gate", () => {
		render(
			<InboxPanel
				items={[{ ...gate, previews: [{ nodeId: "shot:1", label: "S01", imageUrl: null }] }]}
				actions={actions()}
			/>,
		);
		expect(screen.getByRole("button", { name: "S01" })).toBeInTheDocument();
		expect(screen.queryByRole("img")).not.toBeInTheDocument();
	});

	it("offers no second regenerate path inside the outline card", () => {
		render(
			<InboxPanel
				items={[{ ...gate, gate: { run_id: 1, agent: "plan", message: "", story_outline: { logline: "雨夜", genre: [], acts: [{ act: 1, title: "相遇", summary: "便利店" }] } } as never }]}
				actions={actions()}
			/>,
		);
		expect(screen.queryByRole("button", { name: /重做|重新生成/ })).not.toBeInTheDocument();
		expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
	});

	it("hides 继续 when the run cannot be resumed", () => {
		render(
			<InboxPanel items={[{ kind: "recoverable", id: "recoverable", title: "运行中断", detail: "无法继续", resumable: false }]} actions={actions()} />,
		);
		expect(screen.queryByRole("button", { name: "继续" })).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
	});

	it("keeps the raw error behind a 详细信息 disclosure", async () => {
		render(
			<InboxPanel
				items={[{ kind: "recoverable", id: "recoverable", title: "运行中断于分镜脚本确认", detail: "执行中断（引擎租约过期）", resumable: true, rawError: "run lease expired" }]}
				actions={actions()}
			/>,
		);
		expect(screen.getByText("执行中断（引擎租约过期）")).toBeVisible();
		const raw = screen.getByText("run lease expired");
		expect(raw).not.toBeVisible();
		await userEvent.click(screen.getByText("详细信息"));
		expect(raw).toBeVisible();
	});

	it("selects a blocking shot and retries a failed run", async () => {
		const a = actions();
		render(
			<InboxPanel
				items={[
					{ kind: "blocked", id: "blocked", title: "1 个分镜阻塞成片", clips: [{ shot_id: 9, order: 2, status: "failed", reason: "视频失败" }] },
					{ kind: "failed", id: "failed", title: "最近一次生成失败", detail: "可以重试" },
				]}
				actions={a}
			/>,
		);
		await userEvent.click(screen.getByRole("button", { name: "在画布上选中分镜 S02" }));
		expect(a.onSelectShot).toHaveBeenCalledWith(9);
		await userEvent.click(screen.getByRole("button", { name: "从失败阶段重试" }));
		expect(a.onRetry).toHaveBeenCalledTimes(1);
	});
});
