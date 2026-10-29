import type { ConfigItem, ConfigValue } from "~/types";
import { ConfigInput } from "./ConfigInput";
import { getConfigDescription } from "./configDescriptions";

export type ConfigChangeHandler = (
	e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
) => void;

/** 单个配置项：键名、敏感/仅 .env 标记、输入框、说明 */
export function ConfigField({
	item,
	value,
	onChange,
}: {
	item: ConfigItem;
	value: ConfigValue | undefined;
	onChange: ConfigChangeHandler;
}) {
	return (
		<div className="rounded-md border border-line bg-paper-200/70 p-2.5">
			<div className="mb-1.5 flex flex-wrap items-center gap-1.5">
				<span className="font-mono text-xs font-bold">{item.key.toUpperCase()}</span>
				{item.is_sensitive && (
					<span className="badge-doodle bg-warning/15 text-warning-fg border-warning/30 text-xs px-1.5 py-0.5">敏感</span>
				)}
				{item.source === "env" && (
					<span className="badge-doodle bg-info/15 text-info-fg border-info/30 text-xs px-1.5 py-0.5">仅.env</span>
				)}
			</div>
			<ConfigInput item={item} value={String(value ?? "")} onChange={onChange} />
			<p className="mt-1.5 text-xs text-ink-muted">{getConfigDescription(item.key)}</p>
		</div>
	);
}
