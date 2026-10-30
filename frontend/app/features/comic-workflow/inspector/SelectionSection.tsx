import type { ComicWorkflowNode } from "../graph/types";
import { styleLabel } from "~/features/projects/styleCategories";
import { FieldList as Fields } from "./fields";
import { nodeStatusLabel } from "../canvas/WorkflowCards";

function FieldList({ items, said }: { items: Array<[string, string | number]>; said: Set<string> }) {
	return <Fields items={items.filter(([, value]) => !said.has(String(value)))} />;
}

/**
 * 概览：只列头部（类型 · 名称 · 副标题）没说的字段。
 * 值和头部的名称或副标题相同的行（项目标题、风格、角色名、分镜场景、成片状态）一律不列；镜头序号就是 S01，也不列。
 */
export function SelectionSection({ node }: { node: ComicWorkflowNode }) {
	const said = new Set([node.title, node.subtitle]);

	if (node.kind === "brief") {
		return (
			<FieldList
				said={said}
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
				said={said}
				items={[
					["状态", nodeStatusLabel(node.status)],
					["名称", node.character.name],
					// 一致性特征是可选的后台索引：没有时不显示，免得像是出了问题
					...(node.character.has_embedding ? ([["一致性特征", "已计算"]] as Array<[string, string]>) : []),
				]}
			/>
		);
	}

	if (node.kind === "shot") {
		return (
			<FieldList
				said={said}
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
				said={said}
			items={[
				["状态", node.subtitle],
				["视频", node.videoUrl ? "已生成" : "未生成"],
				["阻塞镜头", node.blockingClips.length],
			]}
		/>
	);
}
