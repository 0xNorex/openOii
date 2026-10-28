import { useEffect, useRef, useState } from "react";
import { MessageInput } from "~/components/chat/MessageInput";
import { toast } from "~/utils/toast";

interface PromptBarProps {
	selectionLabel: string | null;
	awaitingConfirm: boolean;
	isGenerating: boolean;
	onSendFeedback: (content: string) => void;
	onConfirm: (feedback?: string) => void;
}

export function PromptBar({
	selectionLabel,
	awaitingConfirm,
	isGenerating,
	onSendFeedback,
	onConfirm,
}: PromptBarProps) {
	const [input, setInput] = useState("");
	const wasAwaitingConfirm = useRef(awaitingConfirm);

	useEffect(() => {
		if (wasAwaitingConfirm.current && !awaitingConfirm) setInput("");
		wasAwaitingConfirm.current = awaitingConfirm;
	}, [awaitingConfirm]);

	const handleSend = () => {
		if (!input.trim()) return;
		if (awaitingConfirm) {
			onConfirm(input.trim());
			setInput("");
			return;
		}
		if (isGenerating) {
			toast.info({
				title: "请稍候",
				message: "当前阶段进行中；待审阅确认后再反馈，或先停止任务。",
			});
			return;
		}
		onSendFeedback(input);
		setInput("");
	};

	return (
		<footer
			className="z-panel shrink-0 border-t-2 border-ink/15 bg-paper-100 px-2 py-1.5 sm:px-3"
			data-shell="prompt-bar"
		>
			<div className="mx-auto flex max-w-5xl items-center gap-2">
				{selectionLabel ? (
					<span
						className="max-w-[35vw] shrink-0 truncate rounded-md border border-info/30 bg-info/10 px-2 py-1 text-xs font-semibold text-info-fg"
						aria-label={`当前选择：${selectionLabel}`}
						title={selectionLabel}
					>
						{selectionLabel}
					</span>
				) : null}
				<div className="min-w-0 flex-1">
					<MessageInput
						value={input}
						onChange={setInput}
						onSend={handleSend}
						placeholder={
							awaitingConfirm
								? "输入修改意见…"
								: selectionLabel
									? "描述如何调整所选内容…"
									: "让 openOii 改变故事…"
						}
						sendLabel={awaitingConfirm ? "请求修改" : "发送"}
					/>
				</div>
			</div>
			{isGenerating && !awaitingConfirm ? (
				<p className="m-0 mt-1 text-center text-xs text-ink-muted" role="status">
					当前阶段进行中，待审批后可提交修改
				</p>
			) : null}
		</footer>
	);
}
