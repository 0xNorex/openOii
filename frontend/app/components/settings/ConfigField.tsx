import type { ConfigItem, ConfigValue } from "~/types";
import { ConfigInput } from "./ConfigInput";
import { getConfigDescription } from "./configDescriptions";
import { getConfigLabel } from "./configLabels";

export type ConfigChangeHandler = (
	e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
) => void;

/** 单个配置项：中文名为主，环境变量名作次要信息；敏感 / 仅 .env 标记、输入框、说明 */
export function ConfigField({
	item,
	value,
	onChange,
	hint,
}: {
	item: ConfigItem;
	value: ConfigValue | undefined;
	onChange: ConfigChangeHandler;
	/** 预设给出的更具体的说明（如密钥格式），替代通用说明 */
	hint?: string;
}) {
	const envName = item.key.toUpperCase();
	return (
		<div className="rounded-md border border-line bg-paper-200/70 p-2.5" data-config-key={envName}>
			<div className="mb-1.5 flex flex-wrap items-center gap-1.5">
				<label htmlFor={item.key} className="text-sm font-semibold">
					{getConfigLabel(item.key)}
				</label>
				{item.is_sensitive && (
					<span className="badge-doodle bg-warning/15 text-warning-fg border-warning/30 text-xs px-1.5 py-0.5">敏感</span>
				)}
				{item.source === "env" && (
					<span className="badge-doodle bg-paper-300 text-ink-muted border-line-strong text-xs px-1.5 py-0.5">仅 .env</span>
				)}
				<span className="ml-auto font-mono text-xs text-ink-muted" title="对应的环境变量">
					{envName}
				</span>
			</div>
			<ConfigInput item={item} value={String(value ?? "")} onChange={onChange} />
			<p className="mt-1.5 text-xs text-ink-muted">{hint ?? getConfigDescription(item.key)}</p>
		</div>
	);
}
