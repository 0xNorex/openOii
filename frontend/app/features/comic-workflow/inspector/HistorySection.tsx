import { useQuery } from "@tanstack/react-query";
import { canvasEvents } from "~/components/canvas/canvasEvents";
import { defaultPrevious } from "~/components/panels/versionDiff";
import { versionsApi } from "~/services/api";
import type { ComicWorkflowNode } from "../graph/types";
import { ActionButton, ActionStack, FieldList } from "./fields";
import { nodeStatusLabel } from "../canvas/WorkflowCards";

function formatTime(value: string | null): string {
	if (!value) return "未批准";
	const date = new Date(value);
	return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

/** 历史：当前版本与审批记录，"对比版本"打开版本对比抽屉。 */
export function HistorySection({ node, projectId }: { node: ComicWorkflowNode; projectId: number }) {
	const entityKind = node.kind === "character" || node.kind === "shot" ? node.kind : null;
	const versionsQuery = useQuery({
		queryKey: ["versions", projectId, entityKind, node.entityId],
		queryFn: () => versionsApi.list(projectId, entityKind ?? "character", node.entityId ?? 0),
		enabled: projectId > 0 && entityKind !== null && Boolean(node.entityId),
	});
	if (node.kind === "character" || node.kind === "shot") {
		const entity = node.kind === "character" ? node.character : node.shot;
		// 只有和当前一样的快照时，对比打开也是空的：直接说明原因
		const nothingToCompare =
			versionsQuery.isSuccess &&
			defaultPrevious(entity as unknown as Record<string, unknown>, versionsQuery.data?.versions ?? []) === null;
		const noCompareWhy = (versionsQuery.data?.versions.length ?? 0) === 0 ? "还没有历史版本" : "只有一个版本";
		return (
			<ActionStack>
				<FieldList
					items={[
						// approval_version 只数批准次数；生成出来的 v1…vN 在「对比版本」里，两套编号不混用
						["批准次数", `${entity.approval_version} 次`],
						["状态", nodeStatusLabel(node.status)],
						["批准时间", formatTime(entity.approved_at)],
					]}
				/>
				<ActionButton
					icon="clock-3"
					label="对比生成版本"
					disabled={nothingToCompare}
					disabledReason={nothingToCompare ? `${noCompareWhy}，重新生成或修改后才能对比` : undefined}
					onClick={() =>
						canvasEvents.emit("version-history", { entityType: node.kind, entityId: node.entityId })
					}
				/>
				{nothingToCompare && (
					<p className="m-0 text-xs text-ink-muted">{noCompareWhy}，重新生成或修改后才能对比。</p>
				)}
			</ActionStack>
		);
	}

	return (
		<ActionStack>
			<p className="m-0 text-xs text-ink-muted">项目级的角色与分镜版本都在版本对比里。</p>
			<ActionButton icon="clock-3" label="打开版本对比" onClick={() => canvasEvents.emit("version-history", {})} />
		</ActionStack>
	);
}
