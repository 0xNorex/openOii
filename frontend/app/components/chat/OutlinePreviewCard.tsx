import { useState } from "react";
import { Button } from "~/components/ui/Button";
import type { StoryOutline } from "~/types";
import { SvgIcon } from "~/components/ui/SvgIcon";

interface OutlinePreviewCardProps {
	outline: StoryOutline;
	visualBible?: string | null;
}

/**
 * 审批门里的大纲摘要：一句话梗概 + 各幕标题，详情折叠。
 * 修改意见统一走 PromptBar（「提修改意见」），这里不再放第二套编辑/重做入口。
 */
export function OutlinePreviewCard({ outline, visualBible }: OutlinePreviewCardProps) {
	const [expanded, setExpanded] = useState(false);

	return (
		<div className="space-y-2 rounded-lg border border-paper-300 bg-paper-100 p-3 text-sm">
			<p className="m-0 leading-relaxed text-ink">{outline.logline}</p>

			{outline.genre.length > 0 && (
				<div className="flex flex-wrap gap-1">
					{outline.genre.map((genre) => (
						<span key={genre} className="rounded-md border border-line-strong px-2 py-0.5 text-xs text-ink-muted">
							{genre}
						</span>
					))}
				</div>
			)}

			<ol className="m-0 list-none space-y-1 p-0">
				{outline.acts.map((act) => (
					<li key={`${act.act}-${act.title}`} className="border-l border-primary/40 pl-2">
						<p className="m-0 text-xs font-bold">
							第 {act.act} 幕 · {act.title}
						</p>
						{expanded ? <p className="m-0 text-xs text-ink-muted">{act.summary}</p> : null}
					</li>
				))}
			</ol>

			{expanded && visualBible ? (
				<p className="m-0 rounded-md bg-paper-200 p-2 text-xs text-ink-muted">
					<span className="font-bold">视觉指南：</span>
					{visualBible}
				</p>
			) : null}

			<Button
				type="button"
				variant="ghost"
				size="sm"
				className="gap-1 px-0"
				aria-expanded={expanded}
				onClick={() => setExpanded((v) => !v)}
			>
				<SvgIcon name={expanded ? "chevron-up" : "chevron-down"} size={12} />
				{expanded ? "收起" : "展开各幕梗概"}
			</Button>
		</div>
	);
}
