import {
	HTMLContainer,
	Rectangle2d,
	ShapeUtil,
	T,
	type Geometry2d,
	type RecordProps,
} from "tldraw";
import type { ComicWorkflowNode } from "../../graph/types";
import { WorkflowCardView, WorkflowFrameView } from "../WorkflowCards";
import {
	WORKFLOW_SHAPE_TYPES,
	type WorkflowCardShape,
	type WorkflowFrameShape,
} from "./types";

export class WorkflowFrameShapeUtil extends ShapeUtil<WorkflowFrameShape> {
	static override type = WORKFLOW_SHAPE_TYPES.FRAME;

	static override props: RecordProps<WorkflowFrameShape> = {
		w: T.number,
		h: T.number,
		section: T.any,
		title: T.string,
		eyebrow: T.string,
		status: T.any,
		countLabel: T.string,
		draggable: T.optional(T.boolean),
	};

	getDefaultProps(): WorkflowFrameShape["props"] {
		return {
			w: 520,
			h: 360,
			section: "elements",
			title: "Elements",
			eyebrow: "02 / CAST",
			status: "draft",
			countLabel: "",
			draggable: true,
		};
	}

	override canEdit() {
		return false;
	}

	override canResize() {
		return false;
	}

	getGeometry(shape: WorkflowFrameShape): Geometry2d {
		return new Rectangle2d({
			width: shape.props.w,
			height: shape.props.h,
			isFilled: true,
		});
	}

	component(shape: WorkflowFrameShape) {
		const { w, h, ...props } = shape.props;
		return (
			// text-ink 在 View 内：阻断 tldraw .tl-html-container 的 --tl-color-text 继承
			<HTMLContainer style={{ width: w, height: h, pointerEvents: "all" }}>
				<WorkflowFrameView {...props} />
			</HTMLContainer>
		);
	}

	indicator(shape: WorkflowFrameShape) {
		return <rect width={shape.props.w} height={shape.props.h} rx={20} />;
	}

	override canReceiveNewChildrenOfType(
		_shape: WorkflowFrameShape,
		type: string,
	) {
		return type === WORKFLOW_SHAPE_TYPES.CARD;
	}
}

export class WorkflowCardShapeUtil extends ShapeUtil<WorkflowCardShape> {
	static override type = WORKFLOW_SHAPE_TYPES.CARD;

	static override props: RecordProps<WorkflowCardShape> = {
		w: T.number,
		h: T.number,
		node: T.any,
		draggable: T.optional(T.boolean),
	};

	getDefaultProps(): WorkflowCardShape["props"] {
		return {
			w: 300,
			h: 320,
			node: {} as ComicWorkflowNode,
			draggable: false,
		};
	}

	override canEdit() {
		return false;
	}

	override canResize() {
		return false;
	}

	getGeometry(shape: WorkflowCardShape): Geometry2d {
		return new Rectangle2d({
			width: shape.props.w,
			height: shape.props.h,
			isFilled: true,
		});
	}

	component(shape: WorkflowCardShape) {
		const { w, h, node, draggable = false } = shape.props;
		return (
			<HTMLContainer style={{ width: w, height: h, pointerEvents: "all" }}>
				<WorkflowCardView node={node} draggable={draggable} />
			</HTMLContainer>
		);
	}

	indicator(shape: WorkflowCardShape) {
		return <rect width={shape.props.w} height={shape.props.h} rx={12} />;
	}
}

export const workflowShapeUtils = [
	WorkflowFrameShapeUtil,
	WorkflowCardShapeUtil,
];
