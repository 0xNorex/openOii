import type { ReactNode } from "react";
import { clsx } from "clsx";
import { MonoRuns } from "~/components/ui/MonoRuns";

/**
 * 桌面区块：全站统一的区块语法。
 *
 * 标题行（图标 + 标题 + 计数 + 动作）下压一条 2px 注册线，内容直接
 * 坐在纸面上——不再默认包一层 Card。Card 只留给真正独立、可操作的
 * 对象（宇宙卡、分镜卡、画布节点）；把列表和空状态关进全宽大卡片
 * 只会造出空奶油色死区。
 */
export function DeskSection({
	icon,
	title,
	meta,
	actions,
	children,
	className,
	plainTitle = false,
}: {
	icon?: ReactNode;
	title: string;
	/** 标题默认用 .display（固定文案，字形已子集化）；传用户内容时设 plainTitle 退回正文字体 */
	plainTitle?: boolean;
	meta?: ReactNode;
	actions?: ReactNode;
	children: ReactNode;
	className?: string;
}) {
	return (
		<section
			className={clsx(
				"flex min-w-0 flex-col gap-3",
				className,
			)}
			data-shell="desk-section"
		>
			<div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-1.5">
				<div className="flex min-w-0 items-center gap-1.5">
					{icon ? (
						<span className="shrink-0 text-ink-muted" aria-hidden="true">
							{icon}
						</span>
					) : null}
					<h2 className={clsx("m-0 text-lg font-bold leading-tight", !plainTitle && "display")}>
						{title}
					</h2>
					{meta ? (
						<span className="text-xs text-ink-muted">
							{typeof meta === "string" ? <MonoRuns text={meta} /> : meta}
						</span>
					) : null}
				</div>
				{actions ? (
					<div className="flex shrink-0 flex-wrap items-center gap-1.5">
						{actions}
					</div>
				) : null}
			</div>
			{children}
		</section>
	);
}
