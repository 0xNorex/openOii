import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ActivityTimeline } from "./ActivityTimeline";
import type { ActivityEntry } from "./activityTimeline";

const entry = (id: string, extra: Partial<ActivityEntry> = {}): ActivityEntry => ({
	id,
	kind: "step",
	agent: "plan",
	agentLabel: "规划",
	title: `步骤 ${id}`,
	status: "done",
	children: [],
	...extra,
});

function fakeLayout(el: HTMLElement, { scrollHeight, clientHeight }: { scrollHeight: number; clientHeight: number }) {
	Object.defineProperty(el, "scrollHeight", { configurable: true, value: scrollHeight });
	Object.defineProperty(el, "clientHeight", { configurable: true, value: clientHeight });
}

describe("ActivityTimeline", () => {
	it("中文消息与细节不落在等宽/大写/字距容器里，只有数字走 mono", () => {
		const { container } = render(
			<ActivityTimeline
				entries={[entry("z", { kind: "message", title: "开始生成 8 个分镜视频…", detail: "剩余约 12 秒", durationMs: 1200 })]}
			/>,
		);
		const bad = /\b(font-mono|label-caps|uppercase|tracking-wid[a-z]*)\b/;
		const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
		for (let n = walker.nextNode(); n; n = walker.nextNode()) {
			if (!/[\u4e00-\u9fff]/.test(n.textContent ?? "")) continue;
			for (let el = n.parentElement; el && el !== container; el = el.parentElement) {
				expect(el.className, `「${n.textContent}」`).not.toMatch(bad);
			}
		}
		expect(screen.getByText("1.2s")).toHaveClass("font-mono");
		expect(screen.getByText("12")).toHaveClass("font-mono");
	});

	it("renders steps with duration and expandable details", async () => {
		render(
			<ActivityTimeline
				entries={[
					entry("a", {
						durationMs: 3200,
						children: [{ id: "c1", label: "调用", content: "文本生成" }],
					}),
				]}
			/>,
		);

		expect(screen.getByText("步骤 a")).toBeInTheDocument();
		expect(screen.getByText("3.2s")).toBeInTheDocument();
		const toggle = screen.getByRole("button", { name: "1 项细节" });
		expect(toggle).toHaveAttribute("aria-expanded", "false");
		await userEvent.click(toggle);
		expect(toggle).toHaveAttribute("aria-expanded", "true");
		expect(screen.getByText(/文本生成/)).toBeInTheDocument();
	});

	it("keeps the running step's details open", () => {
		render(
			<ActivityTimeline
				entries={[entry("a", { status: "running", children: [{ id: "c1", label: "调用", content: "渲染" }] })]}
			/>,
		);

		expect(screen.getByRole("button", { name: "1 项细节" })).toHaveAttribute("aria-expanded", "true");
		expect(screen.getByText("规划 · 进行中")).toBeInTheDocument();
	});

	it("follows new entries until the user scrolls up, then offers 跳到最新", async () => {
		const { rerender } = render(<ActivityTimeline entries={[entry("a")]} />);
		const scroller = screen.getByTestId("activity-scroll");
		fakeLayout(scroller, { scrollHeight: 1000, clientHeight: 200 });

		// 跟随：新条目到达时滚到底
		rerender(<ActivityTimeline entries={[entry("a"), entry("b")]} />);
		expect(scroller.scrollTop).toBe(1000);
		expect(screen.queryByRole("button", { name: "跳到最新" })).not.toBeInTheDocument();

		// 用户上滑：停止跟随
		scroller.scrollTop = 100;
		act(() => {
			fireEvent.scroll(scroller);
		});
		rerender(<ActivityTimeline entries={[entry("a"), entry("b"), entry("c")]} />);
		expect(scroller.scrollTop).toBe(100);

		await userEvent.click(screen.getByRole("button", { name: "跳到最新" }));
		expect(scroller.scrollTop).toBe(1000);
		expect(screen.queryByRole("button", { name: "跳到最新" })).not.toBeInTheDocument();
	});

	it("流式行：先显示思考，有正文后显示正文和光标，出错时去掉光标并给出原因", () => {
		const live = { streamId: "s1", agent: "outline", status: "streaming" as const, thinking: "先读故事", text: "", chars: 0 };
		const { rerender } = render(<ActivityTimeline entries={[entry("a")]} live={live} />);
		const row = screen.getByTestId("live-stream");
		expect(row).toHaveTextContent("大纲 · 正在思考");
		expect(row.querySelector(".stream-caret")).not.toBeNull();

		rerender(<ActivityTimeline entries={[entry("a")]} live={{ ...live, text: "午后的猫", chars: 42 }} />);
		expect(row).toHaveTextContent("大纲 · 正在输出");
		expect(row).toHaveTextContent("42 字符");

		rerender(
			<ActivityTimeline entries={[entry("a")]} live={{ ...live, status: "error", text: "午后", error: "连接断开" }} />,
		);
		expect(screen.getByTestId("live-stream")).toHaveAttribute("data-status", "error");
		expect(screen.getByRole("alert")).toHaveTextContent("连接断开");
		expect(screen.getByTestId("live-stream").querySelector(".stream-caret")).toBeNull();
	});
});
