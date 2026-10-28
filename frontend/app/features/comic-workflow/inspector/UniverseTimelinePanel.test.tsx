import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UniverseTimelinePanel } from "./UniverseTimelinePanel";
import type { UniverseTimelineRead } from "~/types";

let queryState: {
	data: UniverseTimelineRead | undefined;
	isLoading: boolean;
	isError: boolean;
};

vi.mock("@tanstack/react-query", () => ({
	useQueryClient: () => ({ invalidateQueries: vi.fn() }),
	useQuery: () => queryState,
	useMutation: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("~/services/api", () => ({
	universesApi: {
		timeline: vi.fn(),
		importSharedCast: vi.fn(),
	},
}));

vi.mock("~/utils/toast", () => ({
	toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const buildTimeline = (): UniverseTimelineRead => ({
	universe_id: 5,
	universe_name: "赛博修仙录",
	world_setting: null,
	style_rules: null,
	shared_character_count: 1,
	chapters: [
		{
			project_id: 11,
			chapter_number: 1,
			chapter_title: "启程",
			title: "第一个项目",
			summary: null,
			status: "ready",
			is_main_story: true,
			is_current: true,
			character_count: 2,
			shot_count: 6,
			has_video: false,
			style: null,
		},
		{
			project_id: 12,
			chapter_number: null,
			chapter_title: null,
			title: "外传项目",
			summary: null,
			status: "draft",
			is_main_story: false,
			is_current: false,
			character_count: 0,
			shot_count: 0,
			has_video: false,
			style: null,
		},
	],
});

const renderPanel = () =>
	render(
		<MemoryRouter>
			<UniverseTimelinePanel universeId={5} currentProjectId={11} />
		</MemoryRouter>,
	);

describe("UniverseTimelinePanel", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		queryState = { data: buildTimeline(), isLoading: false, isError: false };
	});

	it("章节序号缺失时显示「未编号」徽章而不是「第?章」", () => {
		renderPanel();

		expect(screen.queryByText(/第\?章/)).toBeNull();
		expect(screen.getByText("未编号")).toBeInTheDocument();
	});

	it("有编号章节仍显示「第N章」并标记当前", () => {
		renderPanel();

		expect(screen.getByText(/第1章/)).toBeInTheDocument();
		expect(screen.getByText(/· 当前/)).toBeInTheDocument();
	});
});
