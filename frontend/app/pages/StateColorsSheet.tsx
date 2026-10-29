import { NodeStatusBadge } from "~/features/comic-workflow/canvas/nodeStatus";
import type { WorkflowNodeStatus } from "~/features/comic-workflow/graph/types";

/** 卡片六态色板（仅开发构建）：明 / 暗 × 常规 / 红色弱 / 绿色弱 / 蓝色弱 */
const SIX: Array<[string, WorkflowNodeStatus]> = [
	["生成中", "generating"],
	["待确认", "review"],
	["审查中", "reviewing"],
	["需重合成", "superseded"],
	["失败", "blocked"],
	["完成", "ready"],
];

// Machado 2009（严重度 1.0）；feColorMatrix 默认在线性 RGB 中运算，与守护测试一致
const CVD = [
	{ id: "none", label: "常规色觉", matrix: null },
	{ id: "protan", label: "红色弱 Protan", matrix: "0.152286 1.052583 -0.204868 0 0 0.114503 0.786281 0.099216 0 0 -0.003882 -0.048116 1.051998 0 0 0 0 0 1 0" },
	{ id: "deutan", label: "绿色弱 Deutan", matrix: "0.367322 0.860646 -0.227968 0 0 0.280085 0.672501 0.047413 0 0 -0.011820 0.042940 0.968881 0 0 0 0 0 1 0" },
	{ id: "tritan", label: "蓝色弱 Tritan", matrix: "1.255528 -0.076749 -0.178779 0 0 -0.078411 0.930809 0.147602 0 0 0.004733 0.691367 0.303900 0 0 0 0 0 1 0" },
] as const;

function Panel({ theme }: { theme: "light" | "dark" }) {
	return (
		<section data-theme={theme} data-testid={`sheet-${theme}`} className="rounded-lg bg-paper-100 p-4 text-ink">
			<h2 className="mb-3 text-sm font-semibold">{theme === "light" ? "浅色" : "深色"}</h2>
			<div className="grid gap-3">
				{CVD.map((cvd) => (
					<div key={cvd.id} style={cvd.matrix ? { filter: `url(#cvd-${cvd.id})` } : undefined}>
						<p className="mb-1.5 text-xs text-ink-muted">{cvd.label}</p>
						<div className="flex flex-wrap gap-2 rounded-lg border border-line bg-surface p-3">
							{SIX.map(([label, status]) => (
								<NodeStatusBadge key={status} status={status} label={label} />
							))}
						</div>
					</div>
				))}
			</div>
		</section>
	);
}

export function StateColorsSheet() {
	return (
		<main className="min-h-screen bg-paper-200 p-6">
			<svg width="0" height="0" aria-hidden className="absolute">
				{CVD.filter((c) => c.matrix).map((c) => (
					<filter key={c.id} id={`cvd-${c.id}`}>
						<feColorMatrix type="matrix" values={c.matrix ?? ""} />
					</filter>
				))}
			</svg>
			<h1 className="mb-4 text-lg font-semibold text-ink">卡片状态色板</h1>
			<div className="grid gap-4 md:grid-cols-2">
				<Panel theme="light" />
				<Panel theme="dark" />
			</div>
		</main>
	);
}
