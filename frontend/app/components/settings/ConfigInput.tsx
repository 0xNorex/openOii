import { useState } from "react";
import { configApi } from "~/services/api";
import type { ConfigItem } from "~/types";
import { SvgIcon } from "~/components/ui/SvgIcon";
import { IconButton } from "../../components/ui/IconButton";
import { PlainButton } from "../../components/ui/PlainButton";
import "~/components/ui/icons/settingsIcons";

interface ConfigInputProps {
	item: ConfigItem;
	value: string;
	onChange: (
		e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
	) => void;
}

export function ConfigInput({ item, value, onChange }: ConfigInputProps) {
	const [isRevealed, setIsRevealed] = useState(false);
	const [isRevealing, setIsRevealing] = useState(false);

	const isSensitive = item.is_sensitive;
	const isMasked = item.is_masked;

	const handleToggleReveal = async () => {
		if (isRevealed) {
			setIsRevealed(false);
		} else {
			setIsRevealing(true);
			try {
				const result = await configApi.revealValue(item.key);
				setIsRevealed(true);
				if (result.value !== null) {
					onChange({
						target: { name: item.key, value: result.value },
					} as React.ChangeEvent<HTMLInputElement>);
				}
			} catch (error) {
				console.error("Failed to reveal value:", error);
				alert("获取真实值失败，请检查网络连接");
			} finally {
				setIsRevealing(false);
			}
		}
	};

	const fieldClass =
		"input-doodle  h-9 touch-target-dense w-full border border-line-strong bg-paper-100 px-2.5 font-mono text-xs";

	const lowered = value.trim().toLowerCase();
	if (!isSensitive && (lowered === "true" || lowered === "false")) {
		const on = lowered === "true";
		return (
			<PlainButton
				id={item.key}
				role="switch"
				aria-checked={on}
				onClick={() =>
					onChange({
						target: { name: item.key, value: on ? "false" : "true" },
					} as React.ChangeEvent<HTMLInputElement>)
				}
				className="touch-target-dense inline-flex h-9 items-center gap-2 text-xs font-semibold"
			>
				<span
					aria-hidden
					className={`relative inline-block h-5 w-8 rounded-full border transition-colors duration-fast ${
						on ? "border-primary bg-primary" : "border-line-strong bg-paper-300"
					}`}
				>
					<span
						className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-paper-100 shadow-sm transition-transform duration-fast ${
							on ? "translate-x-4" : "translate-x-0.5"
						}`}
					/>
				</span>
				{on ? "开启" : "关闭"}
			</PlainButton>
		);
	}

	if (isSensitive) {
		const displayValue = isRevealed ? value : isMasked ? value : "••••••••";

		return (
			<div className="space-y-1.5">
				<div className="relative">
					<input
						id={item.key}
						name={item.key}
						type="text"
						value={displayValue}
						onChange={onChange}
						className={`${fieldClass} pr-10`}
						autoComplete="off"
						placeholder={isRevealed ? "输入新值…" : ""}
					/>
					<IconButton aria-label={isRevealed ? "隐藏真实值" : "显示真实值"}
						onClick={handleToggleReveal}
						disabled={isRevealing}
						className="absolute inset-y-0 right-0 my-auto text-ink-muted hover:text-ink"
						title={isRevealed ? "隐藏真实值" : "显示真实值"}
					>
						{isRevealing ? (
							<span className=" spinner-doodle h-3 w-3" />
						) : isRevealed ? (
							<SvgIcon name="eye-closed" size={16} />
						) : (
							<SvgIcon name="eye" size={16} />
						)}
					</IconButton>
				</div>
				{!isRevealed && isMasked && (
					<p className="m-0 text-xs text-ink-muted">
						已配置（显示脱敏值），点击眼睛图标可查看真实值
					</p>
				)}
				{isRevealed && (
					<p className="m-0 inline-flex items-center gap-1 text-xs text-warning-fg">
						<SvgIcon name="triangle-alert" size={12} />
						真实值已显示，请注意保护隐私
					</p>
				)}
			</div>
		);
	}

	return (
		<input
			id={item.key}
			name={item.key}
			type="text"
			value={value}
			onChange={onChange}
			className={fieldClass}
			autoComplete="off"
		/>
	);
}
