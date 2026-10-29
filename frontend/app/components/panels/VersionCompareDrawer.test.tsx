import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { ArtifactVersion } from "~/types";

const api = vi.hoisted(() => ({
	characters: [] as Array<Record<string, unknown>>,
	versions: [] as ArtifactVersion[],
}));

vi.mock("~/services/api", () => ({
	getStaticUrl: (url: string | null | undefined) => url ?? null,
	projectsApi: {
		getCharacters: async () => api.characters,
		getShots: async () => [],
	},
	versionsApi: {
		list: async () => ({ entity_type: "character", entity_id: 1, versions: api.versions }),
		rollback: vi.fn(),
	},
}));

import { defaultPrevious, diffSnapshots, VersionCompareDrawer } from "./VersionCompareDrawer";

function version(n: number, snapshot: Record<string, unknown>): ArtifactVersion {
	return { id: n, entity_type: "character", entity_id: 1, version: n, snapshot, trigger: "generation", created_at: "2026-10-29T00:00:00Z" };
}

function renderDrawer() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	return render(
		<QueryClientProvider client={client}>
			<VersionCompareDrawer open projectId={25} initialEntityType="character" initialEntityId={1} onClose={() => {}} />
		</QueryClientProvider>,
	);
}

describe("version compare", () => {
	it("diffs only fields that changed, treating empties as equal", () => {
		expect(diffSnapshots({ name: "阿一", image_url: null, dialogue: "" }, { name: "阿一", image_url: "/a.png" })).toEqual([
			{ field: "image_url", before: null, after: "/a.png" },
		]);
	});

	it("previous is the newest snapshot that differs from current", () => {
		const current = { name: "阿一", image_url: "/b.png" };
		expect(defaultPrevious(current, [version(2, current), version(1, { name: "阿一", image_url: null })])).toBe(1);
		expect(defaultPrevious(current, [version(1, current)])).toBeNull();
	});

	it("opens on 当前 vs the previous version, and the current image shows", async () => {
		api.characters = [{ id: 1, name: "陈望海", description: "老渔夫", image_url: "/now.webp" }];
		api.versions = [version(1, { name: "陈望海", description: "老渔夫", image_url: null })];
		renderDrawer();
		expect(await screen.findByText("新 · 当前")).toBeInTheDocument();
		expect(screen.getByText("旧 · v1 · 生成")).toBeInTheDocument();
		expect(screen.getByRole("img", { name: "新 · 当前" })).toHaveAttribute("src", "/now.webp");
		expect(screen.getByText("这一版还没有图")).toBeInTheDocument();
		expect(screen.queryByText(/内容相同/)).toBeNull();
	});

	it("says there is only one version instead of comparing v1 with itself", async () => {
		api.characters = [{ id: 1, name: "陈望海", image_url: "/now.webp" }];
		api.versions = [version(1, { name: "陈望海", image_url: "/now.webp" })];
		renderDrawer();
		expect(await screen.findByText(/只有一个版本/)).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "回滚到左侧版本" })).toBeNull();
	});
});
