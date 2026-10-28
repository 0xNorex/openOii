import { Button } from "~/components/ui/Button";

interface MessageInputProps {
	value: string;
	onChange: (value: string) => void;
	onSend: () => void;
	disabled?: boolean;
	placeholder?: string;
	sendLabel?: string;
}

export function MessageInput({
	value,
	onChange,
	onSend,
	disabled,
	placeholder,
	sendLabel = "发送",
}: MessageInputProps) {
	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
			e.preventDefault();
			onSend();
		}
	};

	return (
		<div className="flex items-end gap-1.5">
			{/* Enter 发送，Shift+Enter 换行；高度随内容增长 */}
			<textarea
				id="chat-message-input"
				name="message"
				rows={1}
				className="input-doodle max-h-32 min-h-9 min-w-0 flex-1 resize-none px-3 py-1.5 text-sm [field-sizing:content]"
				value={value}
				onChange={(e) => onChange(e.target.value)}
				onKeyDown={handleKeyDown}
				disabled={disabled}
				placeholder={placeholder}
				aria-label={placeholder ?? "消息内容"}
				autoComplete="off"
			/>
			<Button
				onClick={onSend}
				disabled={disabled || !value.trim()}
				size="sm"
				className="h-9 min-h-9 shrink-0 px-3"
			>
				{sendLabel}
			</Button>
		</div>
	);
}
