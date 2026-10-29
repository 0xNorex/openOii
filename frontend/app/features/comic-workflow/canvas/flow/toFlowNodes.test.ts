import { describe, expect, it } from "vitest";
import type { Project, Shot } from "~/types";
import { buildComicWorkflow } from "../../graph/buildComicWorkflow";
import { layoutComicWorkflow } from "../../graph/layoutComicWorkflow";
import { shotReadingOrder, toFlowNodes, type CardFlowNode } from "./toFlowNodes";
import { storyboardViewport } from "./FlowWorkflowView";

function project(overrides: Partial<Project> = {}): Project {
	return {
		id: 1,
		title: "项目",
		story: "故事",
		summary: null,
		style: null,
		video_url: null,
		status: "draft",
		target_shot_count: 2,
		character_hints: [],
		creation_mode: "manual",
		reference_images: [],
		created_at: "",
		updated_at: "",
		provider_settings: {
			text: provider(),
			image: provider(),
			video: provider(),
		},
		...overrides,
	};
}

function provider() {
	return {
		selected_key: "default",
		source: "default" as const,
		resolved_key: null,
		valid: true,
		reason_code: null,
		reason_message: null,
	};
}

function shot(id: number, order: number): Shot {
	return {
		id,
		project_id: 1,
		order,
		description: `镜头 ${order}`,
		image_url: null,
		video_url: null,
		duration: null,
		character_ids: [],
		approval_state: "draft",
		approval_version: 1,
		approved_at: null,
		approved_description: null,
		approved_prompt: null,
		approved_image_prompt: null,
		approved_duration: null,
		approved_camera: null,
		approved_motion_note: null,
		approved_scene: null,
		approved_action: null,
		approved_expression: null,
		approved_lighting: null,
		approved_dialogue: null,
		approved_sfx: null,
		approved_character_ids: [],
		prompt: null,
		image_prompt: null,
		camera: null,
		motion_note: null,
		scene: null,
		action: null,
		expression: null,
		lighting: null,
		dialogue: null,
		sfx: null,
		seed: null,
	};
}

function setup() {
	const graph = buildComicWorkflow({
		project: project({ video_url: "/static/final.mp4", status: "ready" }),
		characters: [],
		shots: [shot(10, 1), shot(11, 2)],
		blockingClips: [],
		isGenerating: false,
	});
	return { graph, layout: layoutComicWorkflow(graph) };
}

describe("toFlowNodes", () => {
	it("puts frames before their cards with parent-relative positions", () => {
		const { graph, layout } = setup();
		const nodes = toFlowNodes(graph, layout, "layout");
		const shotFrame = layout.frames.find((f) => f.section === "shotline")!;
		const first = layout.nodes.find((n) => n.id === "shot:10")!;
		const card = nodes.find((n) => n.id === "shot:10") as CardFlowNode;
		expect(card.parentId).toBe("frame:shotline");
		expect(card.position).toEqual({ x: first.x - shotFrame.x, y: first.y - shotFrame.y });
		const parentIndex = nodes.findIndex((n) => n.id === "frame:shotline");
		expect(parentIndex).toBeLessThan(nodes.indexOf(card));
		expect(card.ariaLabel).toBe(first.node.title);
	});

	it("only lets shots move in sort mode and nothing move when locked", () => {
		const { graph, layout } = setup();
		const sort = toFlowNodes(graph, layout, "sort");
		expect(sort.find((n) => n.id === "shot:10")?.draggable).toBe(true);
		expect(sort.find((n) => n.id === "frame:shotline")?.draggable).toBe(false);
		const locked = toFlowNodes(graph, layout, "locked");
		expect(locked.some((n) => n.draggable)).toBe(false);
		const free = toFlowNodes(graph, layout, "layout");
		expect(free.find((n) => n.id === "frame:shotline")?.draggable).toBe(true);
		expect(free.find((n) => n.id === "shot:10")?.draggable).toBe(false);
	});

	it("keeps saved frame positions", () => {
		const { graph, layout } = setup();
		const nodes = toFlowNodes(graph, layout, "layout", {
			"frame:shotline": { x: 5, y: 6 },
		});
		expect(nodes.find((n) => n.id === "frame:shotline")?.position).toEqual({ x: 5, y: 6 });
	});

	it("marks frames without cards as empty so they can show a hint", () => {
		const graph = buildComicWorkflow({
			project: project({}),
			characters: [],
			shots: [],
			blockingClips: [],
			isGenerating: false,
		});
		const nodes = toFlowNodes(graph, layoutComicWorkflow(graph), "locked");
		const shotline = nodes.find((n) => n.id === "frame:shotline");
		expect(shotline?.type === "frame" && shotline.data.empty).toBe(true);
		const { graph: full, layout } = setup();
		const filled = toFlowNodes(full, layout, "locked").find((n) => n.id === "frame:shotline");
		expect(filled?.type === "frame" && filled.data.empty).toBe(false);
	});
});

describe("shotReadingOrder", () => {
	it("returns null when the visual order matches", () => {
		const { graph, layout } = setup();
		expect(shotReadingOrder(toFlowNodes(graph, layout, "sort"))).toBeNull();
	});

	it("reads the new order row by row", () => {
		const { graph, layout } = setup();
		const nodes = toFlowNodes(graph, layout, "sort").map((n) =>
			n.id === "shot:10" ? { ...n, position: { x: 9999, y: n.position.y } } : n,
		);
		expect(shotReadingOrder(nodes)).toEqual([
			{ shot_id: 11, order: 1 },
			{ shot_id: 10, order: 2 },
		]);
	});
});

describe("storyboardViewport", () => {
	it("centres a board that fits, between the panels", () => {
		const v = storyboardViewport(
			{ x: 0, y: 0, width: 400, height: 200 },
			{ width: 1400, height: 900 },
			{ left: 300, right: 300 },
		);
		expect(v.zoom).toBe(1);
		expect(v.x).toBe(348 + (1400 - 696 - 400) / 2);
	});

	it("stops at the readable zoom and anchors top-left when too big", () => {
		const v = storyboardViewport(
			{ x: 100, y: 50, width: 4000, height: 4000 },
			{ width: 1000, height: 800 },
		);
		expect(v.zoom).toBeCloseTo(12 / 13);
		expect(v.x).toBeCloseTo(48 - 100 * v.zoom);
		expect(v.y).toBeCloseTo(48 - 50 * v.zoom);
	});
});
