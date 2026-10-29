import type { ComicWorkflowNode } from "../graph/types";
import { styleLabel } from "~/features/projects/styleCategories";
import { FieldList } from "./fields";
import { nodeStatusLabel } from "../canvas/WorkflowCards";

/** 选区：类型、名称、状态与关键字段。 */
export function SelectionSection({ node }: { node: ComicWorkflowNode }) {
	if (node.kind === "brief") {
		return (
			<FieldList
				items={[
					["标题", node.project.title],
					["风格", styleLabel(node.project.style) || "未设置"],
					["目标镜头", node.project.target_shot_count ?? "未设置"],
					["角色", node.metrics.characterCount],
					["镜头", node.metrics.shotCount],
					["总时长", node.metrics.totalDuration ? `${node.metrics.totalDuration}s` : "未定"],
				]}
			/>
		);
	}

	if (node.kind === "character") {
		return (
			<FieldList
				items={[
					["名称", node.character.name],
					["状态", nodeStatusLabel(node.status)],
					// 一致性特征是可选的后台索引：没有时不显示，免得像是出了问题
					...(node.character.has_embedding ? ([["一致性特征", "已计算"]] as Array<[string, string]>) : []),
				]}
			/>
		);
	}

	if (node.kind === "shot") {
		return (
			<FieldList
				items={[
					["顺序", node.shot.order],
					["场景", node.shot.scene || "未设置"],
					["机位", node.shot.camera || "未设置"],
					["时长", node.shot.duration ? `${node.shot.duration}s` : "未设置"],
					["角色", node.characterNames.join("、") || "未绑定"],
					["状态", nodeStatusLabel(node.status)],
				]}
			/>
		);
	}

	return (
		<FieldList
			items={[
				["状态", node.subtitle],
				["视频", node.videoUrl ? "已生成" : "未生成"],
				["阻塞镜头", node.blockingClips.length],
			]}
		/>
	);
}
