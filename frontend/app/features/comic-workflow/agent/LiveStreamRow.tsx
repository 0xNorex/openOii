import { useLayoutEffect, useRef, useState } from "react";
import { clsx } from "clsx";
import { AGENT_NAME_MAP } from "~/types";
import { type LiveStream, useTypewriter } from "./liveStream";

/**
 * The LLM call in flight, at the end of the timeline. Text is clipped to a
 * fixed window that keeps the newest lines in view, so the row grows to its
 * cap once and then stays put while text streams in.
 */
export function LiveStreamRow({ stream }: { stream: LiveStream }) {
	const writing = stream.text.length > 0;
	const shown = useTypewriter(writing ? stream.text : stream.thinking);
	const failed = stream.status === "error";
	const label = AGENT_NAME_MAP[stream.agent] ?? stream.agent;
	const windowRef = useRef<HTMLDivElement>(null);
	const [overflow, setOverflow] = useState(false);

	useLayoutEffect(() => {
		const el = windowRef.current;
		if (el) setOverflow(el.scrollHeight > el.clientHeight + 1);
	}, [shown]);

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
						{label} · {failed ? "输出中断" : writing ? "正在输出" : "正在思考"}
					</span>
					{writing ? (
						<span className="shrink-0 font-mono text-xs tabular-nums text-ink-muted">{stream.chars} 字符</span>
					) : null}
				</div>
				<div
					ref={windowRef}
					className="stream-window"
					data-overflow={overflow || undefined}
					data-testid="live-stream-text"
				>
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
			</div>
		</li>
	);
}
