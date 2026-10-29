import { useLayoutEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { MonoRuns } from "~/components/ui/MonoRuns";
import { AGENT_NAME_MAP } from "~/types";
import { type LiveStream, tidyStreamText, useTypewriter } from "./liveStream";

/** 「正在思考 / 正在输出 / 输出中断」 */
export function liveStatusLabel(stream: LiveStream): string {
	if (stream.status === "error") return "输出中断";
	return stream.text.length > 0 ? "正在输出" : "正在思考";
}

export function LiveCharCount({ stream }: { stream: LiveStream }) {
	if (stream.text.length === 0) return null;
	return (
		<span className="shrink-0 text-xs tabular-nums text-ink-muted">
			<MonoRuns text={`${stream.chars} 字符`} />
		</span>
	);
}

/**
 * The streamed text, clipped to a fixed window that keeps the newest lines in
 * view, so the row grows to its cap once and then stays put.
 */
export function LiveStreamBody({ stream }: { stream: LiveStream }) {
	const writing = stream.text.length > 0;
	const shown = tidyStreamText(useTypewriter(writing ? stream.text : stream.thinking));
	const failed = stream.status === "error";
	const windowRef = useRef<HTMLDivElement>(null);
	const [overflow, setOverflow] = useState(false);

	useLayoutEffect(() => {
		const el = windowRef.current;
		if (el) setOverflow(el.scrollHeight > el.clientHeight + 1);
	}, [shown]);

	return (
		<>
			<div ref={windowRef} className="stream-window" data-overflow={overflow || undefined} data-testid="live-stream-text">
				<p
					className={clsx(
						"m-0 select-text whitespace-pre-wrap break-words text-sm",
						writing ? "text-ink" : "text-ink-muted",
					)}
				>
					{shown}
					{failed ? null : <span className="stream-caret" aria-hidden="true" />}
				</p>
			</div>
			{failed ? (
				<p className="m-0 mt-0.5 text-xs text-error-fg" role="alert">
					{stream.error || "模型输出中断"}
				</p>
			) : null}
		</>
	);
}

/** The LLM call in flight when no running step hosts it (see attachLiveStream). */
export function LiveStreamRow({ stream }: { stream: LiveStream }) {
	const failed = stream.status === "error";
	const label = AGENT_NAME_MAP[stream.agent] ?? stream.agent;
	return (
		<li
			className="flex gap-2 py-1"
			data-activity="live"
			data-status={failed ? "error" : "running"}
			data-testid="live-stream"
			aria-busy={!failed}
		>
			<span
				className={clsx("mt-1.5 h-2 w-2 shrink-0 rounded-full", failed ? "bg-error" : "animate-pulse bg-primary")}
				aria-hidden="true"
			/>
			<div className="min-w-0 flex-1">
				<div className="flex items-baseline justify-between gap-2">
					<span className="text-xs font-semibold text-ink-muted">
						{label} · {liveStatusLabel(stream)}
					</span>
					<LiveCharCount stream={stream} />
				</div>
				<LiveStreamBody stream={stream} />
			</div>
		</li>
	);
}
