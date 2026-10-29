import { MemoryRouter } from "react-router-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { UniverseDetailPage } from "./UniverseDetailPage";
import { ApiError } from "~/types/errors";
import type { SharedCharacterRead, UniverseDetail } from "~/types";

/** 文本被 MonoRuns 拆成多段时，按元素整体 textContent 匹配最内层元素 */
const mixed = (want: string | RegExp) => (_: string, el: Element | null) => {
	const hit = (e: Element) => (typeof want === "string" ? e.textContent === want : want.test(e.textContent ?? ""));
	return !!el && hit(el) && ![...el.children].some(hit);
};

const invalidateQueries = vi.fn();
const importCharacterMock = vi.fn();

let queryState: {
	data: UniverseDetail | undefined;
	isLoading: boolean;
	isError: boolean;
	error: Error | null;
};

vi.mock("react-router-dom", async () => {
	const actual =
		await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
	return {
		...actual,
		useParams: () => ({ universeId: "5" }),
	};
});

vi.mock("@tanstack/react-query", () => ({
	useQueryClient: () => ({ invalidateQueries }),
	useQuery: () => queryState,
	useMutation: (options: {
		mutationFn: (variables: unknown) => Promise<unknown>;
		onSuccess?: (result: unknown, variables: unknown) => void;
		onError?: (error: Error) => void;
	}) => ({
		mutate: async (variables?: unknown) => {
			try {
				const result = await options.mutationFn(variables);
				options.onSuccess?.(result, variables);
			} catch (error) {
				options.onError?.(error as Error);
			}
		},
		isPending: false,
	}),
}));

vi.mock("~/services/api", () => ({
	universesApi: {
		get: vi.fn(),
		update: vi.fn(),
		removeProject: vi.fn(),
		createSharedCharacter: vi.fn(),
		importCharacter: (projectId: number, sharedId: number) =>
			importCharacterMock(projectId, sharedId),
	},
}));

vi.mock("~/components/layout/TopBar", () => ({
	TopBar: () => null,
}));

vi.mock("~/components/ui/Modal", () => ({
	Modal: ({ isOpen, children }: { isOpen: boolean; children: React.ReactNode }) =>
		isOpen ? <div>{children}</div> : null,
}));

vi.mock("~/components/universe/SharedCharacterCard", () => ({
	SharedCharacterCard: ({
		character,
		onImport,
	}: {
		character: SharedCharacterRead;
		onImport: (character: SharedCharacterRead) => void;
	}) => (
		<button type="button" onClick={() => onImport(character)}>
			导入 {character.name}
		</button>
	),
}));

vi.mock("~/utils/toast", () => ({
	toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const sharedChar: SharedCharacterRead = {
	id: 9,
	universe_id: 5,
	name: "艾拉",
	description: null,
	visual_notes: null,
	canonical_image_url: null,
	reference_images: [],
	has_embedding: false,
	character_tags: null,
	source_project_id: null,
	source_character_id: null,
	version: 1,
	is_active: true,
	created_at: "2026-07-01T00:00:00Z",
	updated_at: "2026-07-01T00:00:00Z",
	reference_images_count: 0,
} as unknown as SharedCharacterRead;

const buildUniverse = (
	overrides: Partial<UniverseDetail> = {},
): UniverseDetail => ({
	id: 5,
	name: "赛博修仙录",
	description: null,
	world_setting: null,
	style_rules: null,
	cover_image_url: null,
	is_active: true,
	created_at: "2026-07-01T00:00:00Z",
	updated_at: "2026-07-20T00:00:00Z",
	projects_count: 2,
	shared_characters_count: 1,
	chapters: [
		{
			id: 1,
			universe_id: 5,
			project_id: 11,
			chapter_number: 1,
			chapter_title: "启程",
			is_main_story: true,
			created_at: "2026-07-01T00:00:00Z",
			project_title: "第一个项目",
		},
		{
			id: 2,
			universe_id: 5,
			project_id: 12,
			chapter_number: null,
			chapter_title: null,
			is_main_story: false,
			created_at: "2026-07-02T00:00:00Z",
			project_title: "外传项目",
		},
	],
	shared_characters: [sharedChar],
	...overrides,
});

const renderPage = () =>
	render(
		<MemoryRouter>
			<UniverseDetailPage />
		</MemoryRouter>,
	);

describe("UniverseDetailPage", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		importCharacterMock.mockResolvedValue({
			id: 100,
			name: "艾拉",
			project_id: 11,
		});
		queryState = {
			data: buildUniverse(),
			isLoading: false,
			isError: false,
			error: null,
		};
	});

	it("导入目标是基于章节列表的下拉框，无需手填 ID", () => {
		renderPage();

		const select = screen.getByRole("combobox", { name: "导入到章节" });
		expect(select).toBeEnabled();
		const options = screen
			.getAllByRole("option")
			.map((o) => o.textContent);
		expect(options).toEqual(["第1章 · 启程", "未编号 · 外传项目"]);
	});

	it("默认导入到第一个章节，切换下拉后导入到所选章节", async () => {
		renderPage();

		await userEvent.click(screen.getByRole("button", { name: "导入 艾拉" }));
		expect(importCharacterMock).toHaveBeenCalledWith(11, 9);

		await userEvent.selectOptions(
			screen.getByRole("combobox", { name: "导入到章节" }),
			"12",
		);
		await userEvent.click(screen.getByRole("button", { name: "导入 艾拉" }));
		expect(importCharacterMock).toHaveBeenLastCalledWith(12, 9);
	});

	it("无章节时导入下拉禁用并说明原因", () => {
		queryState.data = buildUniverse({ chapters: [], projects_count: 0 });
		renderPage();

		const select = screen.getByRole("combobox", { name: "导入到章节" });
		expect(select).toBeDisabled();
		expect(screen.getByText("暂无章节可导入")).toBeInTheDocument();
	});

	it("章节序号缺失时显示「未编号」徽章而不是「第?章」", () => {
		renderPage();

		expect(screen.queryByText(/第\?章/)).toBeNull();
		// 下拉选项 + 章节列表徽章各出现一次「未编号」
		expect(screen.getByText("未编号")).toBeInTheDocument();
		expect(screen.getByText("第1章")).toBeInTheDocument();
	});

	it("章节列表与共享角色库是 DeskSection 区块并组成 lg 双栏", () => {
		renderPage();

		const sections = Array.from(
			document.querySelectorAll('[data-shell="desk-section"]'),
		);
		const titles = sections.map((s) => s.querySelector("h2")?.textContent);
		expect(titles).toContain("章节列表");
		expect(titles).toContain("共享角色库");

		const chapterSection = sections.find(
			(s) => s.querySelector("h2")?.textContent === "章节列表",
		);
		expect(chapterSection?.parentElement?.className).toContain(
			"lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]",
		);
	});

	it("量词统一为「章节」", () => {
		renderPage();

		expect(screen.getByText(mixed("2 章节"))).toBeInTheDocument();
	});

	it("非 404 错误显示错误面板，重试触发 invalidateQueries", async () => {
		queryState = {
			data: undefined,
			isLoading: false,
			isError: true,
			error: new ApiError({
				code: "INTERNAL",
				message: "boom",
				status: 500,
			}),
		};
		renderPage();

		expect(screen.getByText("宇宙加载失败")).toBeInTheDocument();
		expect(screen.queryByText("宇宙不存在")).toBeNull();

		await userEvent.click(screen.getByRole("button", { name: "重试" }));
		expect(invalidateQueries).toHaveBeenCalledWith({
			queryKey: ["universe", 5],
		});
	});

	it("仅 404 时显示「宇宙不存在」", () => {
		queryState = {
			data: undefined,
			isLoading: false,
			isError: true,
			error: new ApiError({
				code: "NOT_FOUND",
				message: "not found",
				status: 404,
			}),
		};
		renderPage();

		expect(screen.getByText("宇宙不存在")).toBeInTheDocument();
		expect(screen.queryByText("宇宙加载失败")).toBeNull();
	});
});
