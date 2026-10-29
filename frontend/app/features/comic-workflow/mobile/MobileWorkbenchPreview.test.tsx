import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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

	it("names the step and shows a six-segment meter while running", () => {
		renderPreview({
			studioStatus: { ...getStudioStatusMeta("generating"), step: { index: 4, label: "分镜画面", atGate: false } },
		});

		expect(screen.getByText("生成中 · 分镜画面 · 5/6")).toBeInTheDocument();
		expect(screen.getByLabelText("第 5 步，共 6 步")).toBeInTheDocument();
	});

	it("hides the meter when there is no step", () => {
		renderPreview();
		expect(screen.queryByLabelText(/共 6 步/)).toBeNull();
	});

	it("puts the inbox right after the status and the activity at the end", () => {
		renderPreview({
			inbox: <p>INBOX</p>,
			activity: <p>ACTIVITY</p>,
		});

		const text = screen.getByLabelText("项目预览").textContent ?? "";
		expect(text.indexOf("INBOX")).toBeLessThan(text.indexOf("分镜"));
		expect(text.indexOf("ACTIVITY")).toBeGreaterThan(text.indexOf("分镜"));
		expect(screen.getByRole("heading", { name: "最近动态" })).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: /重试失败阶段/ })).not.toBeInTheDocument();
	});

	it("renders the final video player with a download link", () => {
		renderPreview({
			studioStatus: getStudioStatusMeta("ready"),
			videoUrl: "/static/videos/final.mp4",
		});

		expect(screen.getByTestId("mobile-final-video")).toBeInTheDocument();
		const download = screen.getByRole("link", { name: /下载成片/ });
		expect(download).toHaveAttribute("download");
		// 跨源的成片会忽略 download：必须新标签打开，不能把工作台导航走
		expect(download).toHaveAttribute("target", "_blank");
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
