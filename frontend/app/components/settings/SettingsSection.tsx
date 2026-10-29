import { InformationCircleIcon, WrenchScrewdriverIcon } from "@heroicons/react/24/outline";
import type { ConfigItem, ConfigValue } from "~/types";
import { ConfigField, type ConfigChangeHandler } from "./ConfigField";
import { PROVIDER_TABS, TAB_CONFIG, itemsFor, type ProviderTab } from "./settingsTabs";

interface SectionProps {
	tab: string;
	items: ConfigItem[];
	formState: Record<string, ConfigValue>;
	onChange: ConfigChangeHandler;
}

/** 一个设置页签的内容：provider 页签先选服务商再显示分组，其它页签直接列出配置项 */
export function SettingsSection({ tab, items, formState, onChange }: SectionProps) {
	const provider = PROVIDER_TABS[tab];
	const field = (item: ConfigItem) => (
		<ConfigField key={item.key} item={item} value={formState[item.key]} onChange={onChange} />
	);
	return (
		<div className="space-y-3">
			<div className="flex items-start gap-1.5 rounded-md border border-info/30 bg-info/10 px-2.5 py-1.5 text-xs text-info-fg">
				<InformationCircleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
				<span>{TAB_CONFIG[tab]?.desc}</span>
			</div>
			{provider ? (
				<ProviderBody tab={provider} items={items} formState={formState} onChange={onChange} field={field} />
			) : (
				<>
					<div className="space-y-2">{items.map(field)}</div>
					{items.length === 0 && (
						<div className="py-8 text-center text-xs text-ink-muted">
							<InformationCircleIcon className="mx-auto mb-1.5 h-8 w-8 opacity-50" />
							<p className="m-0">此分类暂无配置项</p>
						</div>
					)}
				</>
			)}
		</div>
	);
}

export function currentProvider(tab: ProviderTab, formState: Record<string, ConfigValue>) {
	const key = tab.providerKey;
	return (formState[key.toUpperCase()] || formState[key] || tab.defaultProvider) as string;
}

function ProviderBody({
	tab,
	items,
	formState,
	onChange,
	field,
}: {
	tab: ProviderTab;
	items: ConfigItem[];
	formState: Record<string, ConfigValue>;
	onChange: ConfigChangeHandler;
	field: (item: ConfigItem) => React.ReactNode;
}) {
	const provider = currentProvider(tab, formState);
	const name = tab.providerKey.toUpperCase();
	const Icon = tab.icon;
	const hasProviderItem = items.some((i) => i.key.toLowerCase() === tab.providerKey);
	return (
		<>
			{hasProviderItem && (
				<div className="rounded-md border border-ink/15 bg-paper-200/70 p-2.5">
					<div className="mb-2 flex items-center gap-1.5">
						<span className="font-mono text-xs font-bold">{name}</span>
						<span className="badge-doodle bg-primary text-primary-content border-primary/30 text-xs px-1.5 py-0.5">必选</span>
					</div>
					<div className={tab.layout === "grid" ? "grid grid-cols-1 gap-2 lg:grid-cols-3" : "flex flex-col gap-2 lg:flex-row"}>
						{tab.options.map((option) => (
							<label
								key={option.value}
								className={`flex flex-1 cursor-pointer items-center gap-2 rounded-md border p-2.5 transition-colors duration-fast ${
									provider === option.value ? "border-info bg-info/10" : "border-ink/20 hover:bg-paper-300"
								}`}
							>
								<input
									type="radio"
									name={name}
									value={option.value}
									checked={provider === option.value}
									onChange={onChange}
									className="h-4 w-4 accent-primary"
								/>
								<div className="min-w-0">
									<div className="text-sm font-bold">{option.title}</div>
									<div className="text-xs text-ink-muted">{option.desc}</div>
								</div>
							</label>
						))}
					</div>
				</div>
			)}
			{tab.groups.map((group, index) => {
				if (group.providers && !group.providers.includes(provider)) return null;
				const groupItems = itemsFor(items, group.match);
				if (groupItems.length === 0 && !group.note) return null;
				const common = !group.providers;
				const GroupIcon = common ? WrenchScrewdriverIcon : Icon;
				return (
					<div key={index} className="space-y-2">
						<h4 className={`m-0 flex items-center gap-1.5 text-xs font-bold ${common ? "text-ink-muted" : "text-info-fg"}`}>
							<GroupIcon className="h-3.5 w-3.5" />
							{typeof group.title === "function" ? group.title(provider) : group.title}
						</h4>
						<div className={`space-y-2 rounded-r-md py-1.5 pl-2.5 ${common ? "bg-paper-300/30" : "bg-info/5"}`}>
							{groupItems.map(field)}
							{group.note ? <p className="m-0 px-1 text-xs text-ink-muted">{group.note}</p> : null}
						</div>
					</div>
				);
			})}
		</>
	);
}
