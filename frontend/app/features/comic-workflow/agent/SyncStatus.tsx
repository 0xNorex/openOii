import { clsx } from "clsx";
import { useEffect, useState } from "react";
import { PlainButton } from "~/components/ui/PlainButton";
import { SvgIcon } from "~/components/ui/SvgIcon";
import { useConnectionStatus } from "~/query/connectionStatus";

/** 运行中多久没有任何事件就提示“可能断开了”。 */
export const STALE_AFTER_MS = 30_000;

export function formatAgo(ms: number): string {
	const s = Math.max(0, Math.floor(ms / 1000));
	if (s < 5) return "刚刚";
	if (s < 60) return `${s} 秒前`;
	const m = Math.floor(s / 60);
	if (m < 60) return `${m} 分钟前`;
	return `${Math.floor(m / 60)} 小时前`;
}

export type SyncTone = "ok" | "stale" | "offline";

export function deriveSyncTone(args: {
	link: "connecting" | "open" | "closed";
	lastAt: number | null;
	now: number;
	/** 运行在跑（不在闸门）：这时才期待持续有事件 */
	expectingEvents: boolean;
}): SyncTone {
	if (args.link === "closed") return "offline";
	if (args.expectingEvents && args.lastAt !== null && args.now - args.lastAt > STALE_AFTER_MS) return "stale";
	return "ok";
}

/**
 * 「最后更新 N 秒前」+ 断线提示。时间取 WS 最后一条事件与最近一次服务端校准中较新的那个。
 */
export function SyncStatus({
	projectId,
	syncedAt,
	expectingEvents,
	onResync,
}: {
	projectId: number;
	syncedAt: number | null;
	expectingEvents: boolean;
	onResync: () => void;
}) {
	const { state, lastEventAt } = useConnectionStatus(projectId);
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		const timer = setInterval(() => setNow(Date.now()), 5000);
		return () => clearInterval(timer);
	}, []);
	const lastAt = Math.max(lastEventAt ?? 0, syncedAt ?? 0) || null;
	const tone = deriveSyncTone({ link: state, lastAt, now: Math.max(now, lastAt ?? 0), expectingEvents });
	const ago = lastAt ? formatAgo(Math.max(0, now - lastAt)) : null;

	if (tone === "ok") {
		return ago ? (
			<span className="inline-flex shrink-0 items-center gap-1 text-xs text-ink-muted" data-testid="sync-status" data-tone="ok">
				<SvgIcon name="clock-3" size={12} />
				最后更新 {ago}
			</span>
		) : null;
	}

	return (
		<span
			className={clsx(
				"inline-flex min-w-0 items-center gap-1 rounded-full border px-2 text-xs",
				"border-warning/50 bg-warning/10 text-warning-fg",
			)}
			role="status"
			data-testid="sync-status"
			data-tone={tone}
		>
			<SvgIcon name={tone === "offline" ? "wifi-off" : "clock-3"} size={12} className="shrink-0" />
			<span className="truncate">
				{tone === "offline" ? "连接中断，正在重连" : "一段时间没有新进度"}
				{ago ? ` · 最后更新 ${ago}` : ""}
			</span>
			<PlainButton
				className="shrink-0 font-semibold underline-offset-2 hover:underline"
				onClick={onResync}
			>
				立即同步
			</PlainButton>
		</span>
	);
}
