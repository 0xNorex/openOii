import { useState } from "react";
import { Button } from "~/components/ui/Button";
import type { StoryOutline } from "~/types";
import { SvgIcon } from "~/components/ui/SvgIcon";

interface OutlinePreviewCardProps {
	outline: StoryOutline;
	visualBible?: string | null;
	/** 省略时不显示“确认大纲”（审批按钮只在收件箱卡片上）。 */
	onConfirm?: () => void;
	/** 省略时不显示“按意见重做”（意见还在处理时）。 */
	onRegenerate?: (feedback: string) => void;
}

function safeJson(value: StoryOutline): string {
	return JSON.stringify(value, null, 2);
}

export function OutlinePreviewCard({
	outline,
	visualBible,
	onConfirm,
	onRegenerate,
}: OutlinePreviewCardProps) {
	const [expanded, setExpanded] = useState(false);
	const [draft, setDraft] = useState(safeJson(outline));
	const [feedback, setFeedback] = useState("");

	const handleRegenerate = () => {
		const parts = [];
		if (feedback.trim()) parts.push(feedback.trim());
		if (draft.trim() && draft.trim() !== safeJson(outline)) {
			parts.push(`请按以下编辑后的大纲方向重新生成：\n${draft.trim()}`);
		}
		onRegenerate?.(parts.join("\n\n") || "请重新生成故事大纲");
	};

	return (
		<div className="rounded-lg border border-paper-300 bg-paper-100 p-3 space-y-2 text-sm">
			<div>
				<p className="label-caps text-ink-muted">
					Story Outline
				</p>
				<h3 className="display font-bold text-base">故事大纲待确认</h3>
			</div>

			<p className="leading-relaxed text-ink-muted">{outline.logline}</p>

			{outline.genre.length > 0 && (
				<div className="flex flex-wrap gap-1">
					{outline.genre.map((genre) => (
						<span key={genre} className="rounded-md border border-line-strong px-2 py-0.5 text-xs text-ink-muted">
							{genre}
						</span>
					))}
				</div>
			)}

			<div className="space-y-1">
				{outline.acts.map((act) => (
					<div key={`${act.act}-${act.title}`} className="border-l border-primary/40 pl-2">
						<p className="font-bold text-xs">
							第 {act.act} 幕 · {act.title}
						</p>
						<p className="text-xs text-ink-muted">{act.summary}</p>
					</div>
				))}
			</div>

			{visualBible && (
				<p className="text-xs text-ink-muted bg-paper-200/60 rounded-md p-2">
					<span className="font-bold">视觉指南：</span>
					{visualBible.slice(0, 120)}{visualBible.length > 120 ? "…" : ""}
				</p>
			)}

			<Button
				type="button"
				variant="ghost"
				size="sm"
				className="gap-1 px-0"
				onClick={() => setExpanded((v) => !v)}
			>
				{expanded ? <SvgIcon name="chevron-up" size={12} /> : <SvgIcon name="chevron-down" size={12} />}
				{expanded ? "收起编辑" : "展开详细大纲"}
			</Button>

			{expanded && (
				<div className="space-y-2">
					<textarea
						className="min-h-40 w-full resize-y rounded-md border border-border-strong bg-paper-200 p-2 font-mono text-xs focus:border-primary"
						value={draft}
						onChange={(e) => setDraft(e.currentTarget.value)}
						aria-label="编辑故事大纲 JSON"
					/>
					<textarea
						className="min-h-16 w-full resize-y rounded-md border border-border-strong bg-paper-200 p-2 text-xs focus:border-primary"
						value={feedback}
						onChange={(e) => setFeedback(e.currentTarget.value)}
						placeholder="重新生成要求（可选）"
						aria-label="重新生成要求"
					/>
				</div>
			)}

			<div className="flex gap-2 pt-1">
				{onConfirm ? (
					<Button size="sm" variant="primary" onClick={onConfirm} className="flex-1">
						确认大纲
					</Button>
				) : null}
				{onRegenerate ? (
					<Button size="sm" variant="secondary" onClick={handleRegenerate} className="flex-1">
						按意见重做
					</Button>
				) : null}
			</div>
		</div>
	);
}
