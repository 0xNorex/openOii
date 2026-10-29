import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { canvasEvents } from "~/components/canvas/canvasEvents";
import { assetsApi, charactersApi, getStaticUrl, shotsApi, universesApi } from "~/services/api";
import { removeCharacterFromCache, removeShotFromCache, upsertCharacterInCache, upsertShotInCache } from "~/query/applyServerEvent";
import { toast } from "~/utils/toast";
import type { ComicWorkflowNode } from "../graph/types";
import { ActionButton, ActionStack, errorMessage } from "./fields";
import { MultiShotActions } from "./MultiShotActions";

/** 生成：批准、重做、资产与宇宙同步、删除。 */
export function GenerationSection({
	projectId,
	node,
	structureLocked,
	universeId = null,
	multiShotIds = [],
}: {
	projectId: number;
	node: ComicWorkflowNode;
	structureLocked: boolean;
	universeId?: number | null;
	multiShotIds?: number[];
}) {
	const queryClient = useQueryClient();
	const [busy, setBusy] = useState<string | null>(null);
	const writeDisabled = structureLocked || Boolean(busy);

	if (multiShotIds.length > 1) {
		return (
			<MultiShotActions
				projectId={projectId}
				shotIds={multiShotIds}
				structureLocked={structureLocked}
			/>
		);
	}

	const invalidateProjectData = () => {
		queryClient.invalidateQueries({ queryKey: ["project", projectId] });
		queryClient.invalidateQueries({ queryKey: ["characters", projectId] });
		queryClient.invalidateQueries({ queryKey: ["shots", projectId] });
		queryClient.invalidateQueries({ queryKey: ["assets"] });
	};

	const runAction = async (key: string, action: () => Promise<void>) => {
		setBusy(key);
		try {
			await action();
			invalidateProjectData();
		} catch (error) {
			toast.error({ title: "操作失败", message: errorMessage(error, "操作失败") });
		} finally {
			setBusy(null);
		}
	};

	if (node.kind === "brief") {
		return (
			<ActionStack>
				<p className="m-0 text-sm text-ink-muted">
					Brief 只在内容页编辑。生成、恢复和停止由对话面板控制。
				</p>
			</ActionStack>
		);
	}

	if (node.kind === "output") {
		const videoUrl = getStaticUrl(node.videoUrl);
		return (
			<ActionStack>
				<ActionButton
					icon="play"
					label="预览成片"
					disabled={!videoUrl}
					onClick={() => {
						if (!videoUrl) return;
						canvasEvents.emit("preview-video", {
							src: videoUrl,
							title: "最终成片",
						});
					}}
				/>
				<p className="m-0 text-xs text-ink-muted">
					输出节点状态由镜头和合成结果决定，不在画布里手动改写。
				</p>
			</ActionStack>
		);
	}

	const entityId = node.entityId;

	const approve = () =>
		runAction("approve", async () => {
			if (node.kind === "character") {
				const updated = await charactersApi.approve(entityId);
				upsertCharacterInCache(queryClient, updated.project_id, updated);
			} else {
				const updated = await shotsApi.approve(entityId);
				upsertShotInCache(queryClient, updated.project_id, updated);
			}
			toast.success({ title: "审阅", message: "已批准" });
		});

	const regenerate = (type: "image" | "video" = "image") =>
		runAction(type === "image" ? "regenerate" : "regenerate-video", async () => {
			if (node.kind === "character") {
				await charactersApi.regenerate(entityId);
			} else {
				await shotsApi.regenerate(entityId, type);
			}
			const cell =
				node.kind === "shot" ? `格 ${node.gridCell ?? node.shot.order}` : "当前角色";
			toast.success({
				title:
					node.kind === "character"
						? "重新生成当前角色"
						: type === "image"
							? `重做本格 · 首帧（${cell}）`
							: `重做本格 · 视频（${cell}）`,
				message: "任务已启动，仅影响选中实体",
			});
		});

	const addToAssets = () =>
		runAction("asset", async () => {
			if (node.kind === "character") {
				await assetsApi.createFromCharacter(entityId);
			} else {
				await assetsApi.createFromShot(entityId);
			}
			toast.success({ title: "资产库", message: "已保存" });
		});

	const promoteToUniverse = () =>
		runAction("promote", async () => {
			if (!universeId || node.kind !== "character") return;
			await universesApi.promoteCharacter(universeId, entityId);
			queryClient.invalidateQueries({ queryKey: ["universe", universeId] });
			toast.success({
				title: "已提升到宇宙",
				message: "共享角色库已更新，后续章节可沿用",
			});
		});

	const syncToUniverse = () =>
		runAction("sync", async () => {
			if (node.kind !== "character") return;
			await universesApi.syncCharacter(entityId);
			if (universeId) {
				queryClient.invalidateQueries({ queryKey: ["universe", universeId] });
			}
			toast.success({
				title: "已同步回宇宙",
				message: "共享角色圣经版本 +1",
			});
		});

	const deleteNode = () =>
		runAction("delete", async () => {
			const confirmed = window.confirm(deleteMessage(node));
			if (!confirmed) return;
			if (node.kind === "character") {
				await charactersApi.delete(entityId);
				removeCharacterFromCache(queryClient, projectId, entityId);
			} else {
				await shotsApi.delete(entityId);
				removeShotFromCache(queryClient, projectId, entityId);
			}
			toast.success({ title: "删除", message: "已删除" });
		});

	const shotCellLabel =
		node.kind === "shot" ? `格 ${node.gridCell ?? node.shot.order}` : null;

	return (
		<ActionStack>
			{structureLocked ? (
				<div className="rounded-md border border-warning/25 bg-warning/10 px-2 py-1.5 text-xs text-warning-fg">
					生成运行中，结构写入操作已锁定。
				</div>
			) : null}
			{shotCellLabel ? (
				<div className="rounded-md border border-info/30 bg-info/10 px-2 py-1.5 text-xs leading-relaxed text-ink-muted">
					<strong className="text-info-fg">{shotCellLabel}</strong>
					{" · "}
					重做只刷新这一格，不影响其他分镜与角色资产。也可在对话里绑定本格发反馈；可多选多格批量重做。
				</div>
			) : null}
			<ActionButton
				icon="check"
				label={node.status === "approved" ? "已批准" : "批准此节点"}
				primary
				disabled={writeDisabled || node.status === "approved"}
				loading={busy === "approve"}
				onClick={approve}
			/>
			{node.kind === "shot" ? (
				<>
					<ActionButton
						icon="refresh-cw"
						label={`重做首帧 · ${shotCellLabel}`}
						disabled={writeDisabled}
						loading={busy === "regenerate"}
						onClick={() => regenerate("image")}
					/>
					<ActionButton
						icon="play"
						label={`重做视频 · ${shotCellLabel}`}
						disabled={writeDisabled}
						loading={busy === "regenerate-video"}
						onClick={() => regenerate("video")}
					/>
				</>
			) : (
				<>
					<ActionButton
						icon="refresh-cw"
						label="重新生成当前角色"
						disabled={writeDisabled}
						loading={busy === "regenerate"}
						onClick={() => regenerate("image")}
					/>
					{universeId ? (
						<>
							<ActionButton
								icon="star"
								label="提升到宇宙共享角色"
								disabled={writeDisabled}
								loading={busy === "promote"}
								onClick={promoteToUniverse}
							/>
							<ActionButton
								icon="refresh-cw"
								label="同步变更回宇宙"
								disabled={writeDisabled}
								loading={busy === "sync"}
								onClick={syncToUniverse}
							/>
						</>
					) : null}
				</>
			)}
			<ActionButton
				icon="archive"
				label="保存到资产库"
				disabled={writeDisabled}
				loading={busy === "asset"}
				onClick={addToAssets}
			/>
			<div className="border-t border-line pt-3">
				<ActionButton
					icon="trash-2"
					label="删除"
					danger
					disabled={writeDisabled}
					loading={busy === "delete"}
					onClick={deleteNode}
				/>
			</div>
		</ActionStack>
	);
}

function deleteMessage(node: ComicWorkflowNode): string {
	if (node.kind === "character") {
		return "确定删除这个角色吗？引用它的镜头会失去角色关联。";
	}
	if (node.kind === "shot") {
		return "确定删除这个镜头吗？镜头顺序和最终合成需要重新确认。";
	}
	return "确定删除吗？";
}
