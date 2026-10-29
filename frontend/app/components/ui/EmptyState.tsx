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
}: {
	icon?: ReactNode;
	title: string;
	/** 正文字体：标题字体只用在 ≥ text-lg 的固定标题上（DESIGN.md §3） */
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
			<p className="m-0 text-sm font-semibold text-ink-muted">
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
