import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { charactersApi, projectsApi, shotsApi } from "~/services/api";
import { upsertCharacterInCache, upsertShotInCache } from "~/query/applyServerEvent";
import { projectQueryKeys } from "~/query/queryKeys";
import type { Character, CharacterUpdatePayload, Project, Shot, ShotUpdatePayload } from "~/types";
import { toast } from "~/utils/toast";
import type { ComicWorkflowNode } from "../graph/types";
import { errorMessage, FormShell, NumberInput, SaveButton, TextArea, TextInput, textOrNull } from "./fields";

/** 属性：可编辑字段。 */
export function PropertiesSection({
	projectId,
	node,
	structureLocked,
}: {
	projectId: number;
	node: ComicWorkflowNode;
	structureLocked: boolean;
}) {
	if (node.kind === "brief") {
		return (
			<ProjectDraftForm
				projectId={projectId}
				project={node.project as Project}
				disabled={structureLocked}
			/>
		);
	}
	if (node.kind === "character") {
		return (
			<CharacterDraftForm character={node.character} disabled={structureLocked} />
		);
	}
	if (node.kind === "shot") {
		return <ShotDraftForm shot={node.shot} disabled={structureLocked} />;
	}
	return (
		<div className="space-y-3 text-sm text-ink-muted">
			<p className="m-0">输出节点不直接编辑内容。</p>
			{node.blockingClips.length > 0 ? (
				<div className="rounded-lg border border-warning/25 bg-warning/10 p-3 text-warning-fg">
					{node.blockingClips.map((clip) => (
						<p key={clip.order} className="m-0">
							镜头 {clip.order}: {clip.reason}
						</p>
					))}
				</div>
			) : null}
		</div>
	);
}

function ProjectDraftForm({
	projectId,
	project,
	disabled,
}: {
	projectId: number;
	project: Project;
	disabled: boolean;
}) {
	const queryClient = useQueryClient();
	const [title, setTitle] = useState(project.title ?? "");
	const [story, setStory] = useState(project.story ?? "");
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		setTitle(project.title ?? "");
		setStory(project.story ?? "");
	}, [project.id, project.title, project.story]);

	const handleSave = async () => {
		setSaving(true);
		try {
			const updated = await projectsApi.update(projectId, {
				expected_revision: project.revision,
				title: title.trim() || project.title,
				story: story.trim() || null,
			});
			queryClient.setQueryData(
				projectQueryKeys.project(projectId),
				(current: typeof project | undefined) =>
					current ? { ...current, title: updated.title, story: updated.story } : current,
			);
			queryClient.invalidateQueries({ queryKey: ["project", projectId] });
			queryClient.invalidateQueries({ queryKey: ["projects"] });
			toast.success({ title: "Brief", message: "已保存" });
		} catch (error) {
			toast.error({ title: "保存失败", message: errorMessage(error, "保存失败") });
		} finally {
			setSaving(false);
		}
	};

	return (
		<FormShell disabled={disabled}>
			<TextInput label="标题" value={title} onChange={setTitle} />
			<TextArea label="故事" value={story} onChange={setStory} rows={8} />
			<SaveButton disabled={disabled} loading={saving} onClick={handleSave} />
		</FormShell>
	);
}

function CharacterDraftForm({
	character,
	disabled,
}: {
	character: Character;
	disabled: boolean;
}) {
	const queryClient = useQueryClient();
	const [draft, setDraft] = useState<CharacterUpdatePayload>({
		name: character.name,
		description: character.description ?? "",
		visual_notes: character.visual_notes ?? "",
	});
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		setDraft({
			name: character.name,
			description: character.description ?? "",
			visual_notes: character.visual_notes ?? "",
		});
	}, [character.id, character.name, character.description, character.visual_notes]);

	const handleSave = async () => {
		setSaving(true);
		try {
			const updated = await charactersApi.update(character.id, {
				expected_revision: character.revision,
				name: textOrNull(draft.name),
				description: textOrNull(draft.description),
				visual_notes: textOrNull(draft.visual_notes),
			});
			upsertCharacterInCache(queryClient, character.project_id, updated);
			queryClient.invalidateQueries({ queryKey: ["characters", character.project_id] });
			toast.success({ title: "角色", message: "已保存" });
		} catch (error) {
			toast.error({ title: "保存失败", message: errorMessage(error, "保存失败") });
		} finally {
			setSaving(false);
		}
	};

	return (
		<FormShell disabled={disabled}>
			<TextInput
				label="名称"
				value={draft.name ?? ""}
				onChange={(value) => setDraft((state) => ({ ...state, name: value }))}
			/>
			<TextArea
				label="描述"
				value={draft.description ?? ""}
				onChange={(value) =>
					setDraft((state) => ({ ...state, description: value }))
				}
				rows={5}
			/>
			<TextArea
				label="视觉笔记"
				value={draft.visual_notes ?? ""}
				onChange={(value) =>
					setDraft((state) => ({ ...state, visual_notes: value }))
				}
				rows={4}
			/>
			<SaveButton disabled={disabled} loading={saving} onClick={handleSave} />
		</FormShell>
	);
}

function ShotDraftForm({ shot, disabled }: { shot: Shot; disabled: boolean }) {
	const queryClient = useQueryClient();
	const [draft, setDraft] = useState<ShotUpdatePayload>({
		description: shot.description,
		scene: shot.scene ?? "",
		action: shot.action ?? "",
		dialogue: shot.dialogue ?? "",
		camera: shot.camera ?? "",
		duration: shot.duration,
		image_prompt: shot.image_prompt ?? "",
		prompt: shot.prompt ?? "",
	});
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		setDraft({
			description: shot.description,
			scene: shot.scene ?? "",
			action: shot.action ?? "",
			dialogue: shot.dialogue ?? "",
			camera: shot.camera ?? "",
			duration: shot.duration,
			image_prompt: shot.image_prompt ?? "",
			prompt: shot.prompt ?? "",
		});
	}, [
		shot.id,
		shot.description,
		shot.scene,
		shot.action,
		shot.dialogue,
		shot.camera,
		shot.duration,
		shot.image_prompt,
		shot.prompt,
	]);

	const handleSave = async () => {
		setSaving(true);
		try {
			const updated = await shotsApi.update(shot.id, {
				expected_revision: shot.revision,
				description: textOrNull(draft.description),
				scene: textOrNull(draft.scene),
				action: textOrNull(draft.action),
				dialogue: textOrNull(draft.dialogue),
				camera: textOrNull(draft.camera),
				duration: draft.duration ?? null,
				image_prompt: textOrNull(draft.image_prompt),
				prompt: textOrNull(draft.prompt),
			});
			upsertShotInCache(queryClient, shot.project_id, updated);
			queryClient.invalidateQueries({ queryKey: ["shots", shot.project_id] });
			toast.success({ title: "镜头", message: "已保存" });
		} catch (error) {
			toast.error({ title: "保存失败", message: errorMessage(error, "保存失败") });
		} finally {
			setSaving(false);
		}
	};

	return (
		<FormShell disabled={disabled}>
			<TextArea
				label="描述"
				value={draft.description ?? ""}
				onChange={(value) =>
					setDraft((state) => ({ ...state, description: value }))
				}
				rows={4}
			/>
			<TextInput
				label="场景"
				value={draft.scene ?? ""}
				onChange={(value) => setDraft((state) => ({ ...state, scene: value }))}
			/>
			<TextInput
				label="动作"
				value={draft.action ?? ""}
				onChange={(value) => setDraft((state) => ({ ...state, action: value }))}
			/>
			<TextArea
				label="对白"
				value={draft.dialogue ?? ""}
				onChange={(value) =>
					setDraft((state) => ({ ...state, dialogue: value }))
				}
				rows={3}
			/>
			<div className="grid grid-cols-2 gap-2">
				<TextInput
					label="机位"
					value={draft.camera ?? ""}
					onChange={(value) =>
						setDraft((state) => ({ ...state, camera: value }))
					}
				/>
				<NumberInput
					label="时长"
					value={draft.duration ?? null}
					onChange={(value) =>
						setDraft((state) => ({ ...state, duration: value }))
					}
				/>
			</div>
			<TextArea
				label="首帧提示词"
				value={draft.image_prompt ?? ""}
				onChange={(value) =>
					setDraft((state) => ({ ...state, image_prompt: value }))
				}
				rows={4}
			/>
			<TextArea
				label="视频提示词"
				value={draft.prompt ?? ""}
				onChange={(value) => setDraft((state) => ({ ...state, prompt: value }))}
				rows={4}
			/>
			<SaveButton disabled={disabled} loading={saving} onClick={handleSave} />
		</FormShell>
	);
}
