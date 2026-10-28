import type { BlockingClip, Character, Project, Shot } from "~/types";

export type ComicWorkflowSection = "brief" | "elements" | "shotline" | "output";
export type ComicWorkflowNodeKind = "brief" | "character" | "shot" | "output";
export type ComicWorkflowEdgeKind =
	| "dependency"
	| "reference"
	| "sequence"
	| "blocking";

export interface ComicWorkflowNodeBase {
	id: string;
	kind: ComicWorkflowNodeKind;
	section: ComicWorkflowSection;
	title: string;
	subtitle: string;
	status: WorkflowNodeStatus;
	entityId: number | null;
}

export type WorkflowNodeStatus =
	| "draft"
	| "generating"
	| "review"
	| "unconfirmed"
	| "approved"
	| "blocked"
	| "superseded"
	| "ready";

export interface BriefWorkflowNode extends ComicWorkflowNodeBase {
	kind: "brief";
	project: Pick<
		Project,
		| "id"
		| "title"
		| "story"
		| "summary"
		| "style"
		| "target_shot_count"
		| "status"
		| "video_url"
	>;
	metrics: {
		characterCount: number;
		shotCount: number;
		totalDuration: number | null;
	};
}

export interface CharacterWorkflowNode extends ComicWorkflowNodeBase {
	kind: "character";
	entityId: number;
	character: Character;
	imageUrl: string | null;
}

export interface ShotWorkflowNode extends ComicWorkflowNodeBase {
	kind: "shot";
	entityId: number;
	shot: Shot;
	imageUrl: string | null;
	videoUrl: string | null;
	characterNames: string[];
	/** 0-based index in ordered shotline (for 九宫格 cell label). */
	gridIndex: number;
	/** 1-based cell number for display (格 1 …). */
	gridCell: number;
}

export type OutputState =
	| "waiting"
	| "blocked"
	| "needs_recompose"
	| "ready";

export interface OutputWorkflowNode extends ComicWorkflowNodeBase {
	kind: "output";
	outputState: OutputState;
	projectId: number;
	videoUrl: string | null;
	blockingClips: BlockingClip[];
	/** 历史导出产物（Webtoon 长图等），成片卡上直接可下 */
	exports: string[];
}

export type ComicWorkflowNode =
	| BriefWorkflowNode
	| CharacterWorkflowNode
	| ShotWorkflowNode
	| OutputWorkflowNode;

export interface ComicWorkflowEdge {
	id: string;
	from: string;
	to: string;
	kind: ComicWorkflowEdgeKind;
	label: string;
}

export interface ComicWorkflowSectionFrame {
	id: string;
	section: ComicWorkflowSection;
	title: string;
	eyebrow: string;
	status: WorkflowNodeStatus;
	countLabel: string;
}

export interface ComicWorkflowGraph {
	projectId: number;
	sections: ComicWorkflowSectionFrame[];
	nodes: ComicWorkflowNode[];
	edges: ComicWorkflowEdge[];
	orderedShotIds: number[];
}

