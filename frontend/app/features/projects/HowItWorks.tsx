import { SvgIcon } from "~/components/ui/SvgIcon";

const STEPS = [
	{ title: "写下想法", body: "一句话、一段梗概都行。也可以先选一个示例开头。" },
	{ title: "分阶段生成", body: "AI 依次做规划、角色、分镜和视频。逐步确认模式下，每个阶段停在「待处理」等你点确认。" },
	{ title: "选中再改", body: "在画布上选中卡片，用底部提示栏描述要改的地方，只重做选中的部分。" },
];

const TERMS = [
	{ term: "宇宙", body: "多部作品共享的角色和世界观；新项目可以作为其中一章。" },
	{ term: "自动确认", body: "阶段自动通过，一口气生成到成片；随时可在提示栏左侧切回逐步确认。" },
	{ term: "待处理", body: "所有需要你决定的事都在 Agent 面板的这个标签里：确认、重试、继续。" },
];

/** 首次使用引导：没有项目时默认展开，之后收成一行 */
export function HowItWorks({ defaultOpen }: { defaultOpen: boolean }) {
	return (
		<details
			open={defaultOpen}
			className="group rounded-lg border border-line bg-surface px-3 py-2 sm:px-4"
		>
			<summary className="touch-target-dense flex cursor-pointer list-none items-center gap-2 text-sm font-semibold text-ink">
				<SvgIcon name="lightbulb" size={16} />
				怎么用
				<span className="text-xs font-normal text-ink-muted">三步做出第一部漫剧</span>
				<SvgIcon
					name="chevron-right"
					size={14}
					className="ml-auto text-ink-muted transition-transform duration-fast group-open:rotate-90"
				/>
			</summary>
			<ol className="m-0 mt-2 grid list-none gap-3 p-0 sm:grid-cols-3">
				{STEPS.map((step, index) => (
					<li key={step.title} className="flex gap-2">
						<span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 font-mono text-xs font-bold text-primary">
							{index + 1}
						</span>
						<div className="min-w-0">
							<p className="m-0 text-sm font-semibold text-ink">{step.title}</p>
							<p className="m-0 mt-0.5 text-xs leading-relaxed text-ink-muted">{step.body}</p>
						</div>
					</li>
				))}
			</ol>
			<dl className="m-0 mt-3 grid gap-2 border-t border-line pt-3 pb-1 sm:grid-cols-3">
				{TERMS.map((item) => (
					<div key={item.term} className="min-w-0">
						<dt className="text-xs font-semibold text-ink">{item.term}</dt>
						<dd className="m-0 text-xs leading-relaxed text-ink-muted">{item.body}</dd>
					</div>
				))}
			</dl>
		</details>
	);
}
