import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import type { Character, Shot } from "~/types";
import { getStudioStatusMeta } from "../state/deriveStudioStatus";
import { MobileWorkbenchPreview } from "./MobileWorkbenchPreview";

function makeShot(overrides: Partial<Shot> = {}): Shot {
	return {
		id: 1,
		project_id: 7,
		order: 1,
		description: "开场",
		image_url: null,
		video_url: null,
		...overrides,
	} as Shot;
}

function makeCharacter(overrides: Partial<Character> = {}): Character {
	return {
		id: 1,
		name: "小黑",
		image_url: null,
		approved_image_url: null,
		...overrides,
	} as Character;
}

function renderPreview(
	overrides: Partial<Parameters<typeof MobileWorkbenchPreview>[0]> = {},
) {
	return render(
		<MobileWorkbenchPreview
			projectId={7}
			studioStatus={getStudioStatusMeta("idle")}
			videoUrl={null}
			shots={[]}
			characters={[]}
			{...overrides}
		/>,
	);
}

describe("MobileWorkbenchPreview", () => {
	it("shows the desktop hint and visible status copy (not a title attribute)", () => {
		renderPreview({ studioStatus: getStudioStatusMeta("generating") });

		expect(screen.getByText("完整画布编辑请用桌面端打开")).toBeInTheDocument();
		expect(screen.getByText("生成中")).toBeInTheDocument();
		expect(
			screen.getByText("AI 正在推进当前生成运行"),
		).toBeInTheDocument();
	});

	it("offers a retry action for failed runs", async () => {
		const user = userEvent.setup();
		const onRetry = vi.fn();

		renderPreview({
			studioStatus: getStudioStatusMeta("failed"),
			onRetry,
		});

		await user.click(screen.getByRole("button", { name: /重试失败阶段/ }));

		expect(onRetry).toHaveBeenCalledTimes(1);
	});

	it("offers a retry action for recoverable runs", () => {
		renderPreview({
			studioStatus: getStudioStatusMeta("recoverable"),
			onRetry: vi.fn(),
		});

		expect(
			screen.getByRole("button", { name: /重试失败阶段/ }),
		).toBeInTheDocument();
	});

	it("hides the retry action when idle", () => {
		renderPreview({ onRetry: vi.fn() });

		expect(
			screen.queryByRole("button", { name: /重试失败阶段/ }),
		).not.toBeInTheDocument();
	});

	it("renders the final video player with a download link", () => {
		renderPreview({
			studioStatus: getStudioStatusMeta("ready"),
			videoUrl: "/static/videos/final.mp4",
		});

		expect(screen.getByTestId("mobile-final-video")).toBeInTheDocument();
		const download = screen.getByRole("link", { name: /下载成片/ });
		expect(download).toHaveAttribute("download");
		expect(download.getAttribute("href")).toContain(
			"/api/v1/projects/7/final-video",
		);
	});

	it("omits the video block when there is no final cut", () => {
		renderPreview();

		expect(screen.queryByTestId("mobile-final-video")).not.toBeInTheDocument();
		expect(
			screen.queryByRole("link", { name: /下载成片/ }),
		).not.toBeInTheDocument();
	});

	it("renders shot thumbnails in reading order with placeholders", () => {
		renderPreview({
			shots: [
				makeShot({ id: 2, order: 2, image_url: null }),
				makeShot({ id: 1, order: 1, image_url: "/static/shots/1.png" }),
			],
		});

		const thumb = screen.getByAltText("分镜 1");
		expect(thumb.getAttribute("src")).toContain("/static/shots/1.png");
		expect(screen.getByText("待生成")).toBeInTheDocument();
		expect(
			screen.queryByText("还没有分镜，开始生成后会出现在这里"),
		).not.toBeInTheDocument();
	});

	it("shows the empty state when there are no shots", () => {
		renderPreview();

		expect(
			screen.getByText("还没有分镜，开始生成后会出现在这里"),
		).toBeInTheDocument();
	});

	it("renders the character strip with names", () => {
		renderPreview({
			characters: [
				makeCharacter({ id: 1, name: "小黑" }),
				makeCharacter({ id: 2, name: "阿白" }),
			],
		});

		expect(screen.getByText("小黑")).toBeInTheDocument();
		expect(screen.getByText("阿白")).toBeInTheDocument();
	});
});
