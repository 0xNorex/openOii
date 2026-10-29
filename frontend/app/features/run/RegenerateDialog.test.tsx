import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RegeneratePlanRead } from "~/types";
import { projectsApi } from "~/services/api";
import { formatCalls, formatEstimate, RegenerateDialog } from "./RegenerateDialog";

vi.mock("~/services/api", () => ({
	projectsApi: { getRegeneratePlan: vi.fn() },
}));

function plan(patch: Partial<RegeneratePlanRead> = {}): RegeneratePlanRead {
	return {
		project_id: 4,
		has_content: true,
		character_count: 2,
		shot_count: 6,
		has_final_video: true,
		stages: ["剧本", "角色", "分镜", "渲染", "合成"],
		estimate: { seconds_low: 180, seconds_high: 480, text_calls: 4, image_calls: 8, video_calls: 6, basis: "history" },
		previous_version: null,
		...patch,
	};
}

function renderDialog(props: Partial<Parameters<typeof RegenerateDialog>[0]> = {}) {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	const onConfirm = vi.fn();
	const onClose = vi.fn();
	render(
		<QueryClientProvider client={client}>
			<RegenerateDialog open projectId={4} onClose={onClose} onConfirm={onConfirm} {...props} />
		</QueryClientProvider>,
	);
	return { onConfirm, onClose };
}

describe("RegenerateDialog", () => {
	beforeEach(() => vi.clearAllMocks());

	it("formats the time range and call counts", () => {
		expect(formatEstimate(plan())).toBe("约 3–8 分钟");
		expect(formatEstimate(plan({ estimate: { ...plan().estimate, seconds_low: 40, seconds_high: 300 } }))).toBe("约 40 秒–5 分钟");
		expect(formatCalls(plan())).toBe("约 4 次文本、8 次图片、6 次视频调用");
	});

	it("states what is redone, how long, the cost and that the current cut is kept", async () => {
		vi.mocked(projectsApi.getRegeneratePlan).mockResolvedValue(plan());
		const user = userEvent.setup();
		const { onConfirm } = renderDialog();

		expect(await screen.findByText(/剧本 → 角色 → 分镜 → 渲染 → 合成/)).toBeInTheDocument();
		expect(screen.getByText(/约 3–8 分钟/)).toBeInTheDocument();
		expect(screen.getByText(/按上次耗时估算/)).toBeInTheDocument();
		expect(screen.getByText(/按模型服务计费/)).toBeInTheDocument();
		expect(screen.getByTestId("regenerate-keeps-previous")).toHaveTextContent("当前成片和画布（2 个角色、6 个分镜）会保留为上一版");
		// 打开对话框时才预热模型探测
		expect(projectsApi.getRegeneratePlan).toHaveBeenCalledWith(4, true);

		await user.click(screen.getByRole("button", { name: /重新生成/ }));
		expect(onConfirm).toHaveBeenCalledTimes(1);
	});

	it("shows a busy confirm button while the run is being created", async () => {
		vi.mocked(projectsApi.getRegeneratePlan).mockResolvedValue(plan());
		renderDialog({ pending: true });
		const busy = await screen.findByRole("button", { name: /正在创建/ });
		expect(busy).toBeDisabled();
		expect(busy).toHaveAttribute("aria-busy", "true");
		expect(screen.getByRole("button", { name: "取消" })).toBeDisabled();
	});
});
