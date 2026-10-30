import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ComicWorkflowNode } from "../graph/types";
import { SelectionSection } from "./SelectionSection";

function brief(style: string | null): ComicWorkflowNode {
	return {
		id: "brief",
		kind: "brief",
		section: "brief",
		title: "灯塔与猫",
		subtitle: style ? "日漫" : "故事起点",
		status: "approved",
		entityId: 1,
		project: { id: 1, title: "灯塔与猫", story: "", summary: "", style, target_shot_count: 2, status: "ready", video_url: null },
		metrics: { characterCount: 2, shotCount: 2, totalDuration: 10 },
	} as unknown as ComicWorkflowNode;
}

const labels = () => [...document.querySelectorAll(".label")].map((el) => el.textContent);

/** 头部已经写了名称和副标题：概览里不再重复同一件事。 */
describe("SelectionSection", () => {
	it("does not repeat the project title or the style the header already shows", () => {
		render(<SelectionSection node={brief("anime")} />);
		expect(labels()).toEqual(["目标镜头", "角色", "镜头", "总时长"]);
		expect(screen.queryByText("灯塔与猫")).toBeNull();
		expect(screen.queryByText("日漫")).toBeNull();
	});

	it("still says when the style is unset, because the header then reads 故事起点", () => {
		render(<SelectionSection node={brief(null)} />);
		expect(labels()[0]).toBe("风格");
		expect(screen.getByText("未设置")).toBeInTheDocument();
	});

	it("drops the character name and the shot order (the header title is the name and S01)", () => {
		const { unmount } = render(
			<SelectionSection
				node={{ id: "character:1", kind: "character", title: "阿岚", subtitle: "角色设定", status: "review", character: { name: "阿岚", has_embedding: false } } as unknown as ComicWorkflowNode}
			/>,
		);
		expect(labels()).not.toContain("名称");
		expect(screen.queryByText("阿岚")).toBeNull();
		unmount();
		render(
			<SelectionSection
				node={{ id: "shot:1", kind: "shot", title: "S01", subtitle: "灯室", status: "approved", characterNames: ["阿岚"], shot: { order: 1, scene: "灯室", camera: "中景", duration: 5 } } as unknown as ComicWorkflowNode}
			/>,
		);
		expect(labels()).toEqual(["场景", "机位", "时长", "角色", "状态"]);
	});
});
