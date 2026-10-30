import type { ComicWorkflowNode } from "../graph/types";
import { styleLabel } from "~/features/projects/styleCategories";
import { FieldList } from "./fields";
import { nodeStatusLabel } from "../canvas/WorkflowCards";

/**
 * 概览：只列头部（类型 · 名称 · 副标题）没说的字段。
 * 头部已经写了名称（项目标题 / 角色名 / S01），这里不再重复；风格就是项目的副标题，只在未设置时列出。
 */
export function SelectionSection({ node }: { node: ComicWorkflowNode }) {
	if (node.kind === "brief") {
		return (
			<FieldList
				items={[
					...(styleLabel(node.project.style) ? [] : ([["风格", "未设置"]] as Array<[string, string]>)),
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
