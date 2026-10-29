import type { ReactNode } from "react";
import { clsx } from "clsx";

/** Dense empty / soft-empty block used across desks and side panels. */
export function EmptyState({
	icon,
	title,
	description,
	action,
	className,
	compact = false,
	plainTitle = false,
}: {
	icon?: ReactNode;
	title: string;
	/** 标题默认用 .display（固定文案，字形已子集化）；传用户内容时设 plainTitle 退回正文字体 */
	plainTitle?: boolean;
	description?: string;
	action?: ReactNode;
	className?: string;
	compact?: boolean;
}) {
	return (
		<div
			className={clsx(
				"corner-marks flex flex-col items-center justify-center text-center",
				compact ? "px-3 py-8" : "px-4 py-10",
				className,
			)}
			data-shell="empty-state"
		>
			{icon ? (
				<div className="mb-2 text-ink-subtle" aria-hidden="true">
					{icon}
				</div>
			) : null}
			<p className={clsx("m-0 text-sm font-bold text-ink-muted", !plainTitle && "display")}>
				{title}
			</p>
			{description ? (
				<p className="m-0 mt-1 max-w-sm text-xs text-ink-muted text-pretty">
					{description}
				</p>
			) : null}
			{action ? <div className="mt-3">{action}</div> : null}
		</div>
	);
}
