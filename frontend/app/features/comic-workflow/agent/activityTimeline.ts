import { AGENT_NAME_MAP, type AgentMessage } from "~/types";

export type ActivityKind = "run" | "handoff" | "step" | "message" | "user" | "error";
export type ActivityStatus = "running" | "done" | "error";

export interface ActivityChild {
	id: string;
	label: string;
	content: string;
}

export interface ActivityEntry {
	id: string;
	kind: ActivityKind;
	agent: string;
	agentLabel: string;
	title: string;
	detail?: string;
	status: ActivityStatus;
	durationMs?: number;
	children: ActivityChild[];
}

/** Tool/step detail rows that hang under the current step instead of standing alone. */
const CHILD_LABELS: Record<string, string> = {
	thinking: "思考",
	tool: "工具",
	tool_call: "调用",
	tool_result: "工具结果",
	step_result: "步骤结果",
	result: "审查结果",
};

const PHASE_LABELS: Record<string, string> = {
	reasoning: "分析",
	decision: "决策",
	planning: "规划",
	reviewing: "检查",
};

function isNoise(msg: AgentMessage): boolean {
	if (msg.role === "info" && msg.agent === "system") return true;
	if (msg.role === "separator" || msg.role === "handoff" || msg.role === "thinking") return false;
	return !msg.content?.trim() && !msg.isLoading;
}

function time(msg: AgentMessage): number | undefined {
	const t = msg.timestamp ? Date.parse(msg.timestamp) : Number.NaN;
	return Number.isNaN(t) ? undefined : t;
}

function childContent(msg: AgentMessage): string {
	if (msg.role === "thinking") {
		const phase = msg.phase ? PHASE_LABELS[msg.phase] : undefined;
		return [phase, msg.content?.trim()].filter(Boolean).join(" · ") || "处理中";
	}
	return msg.content?.trim() ?? "";
}

/** 三个半角句点（可夹空格）或「。。。」→「…」 */
export function tidyEllipsis(text: string): string {
	return text.replace(/ ?\.(?: ?\.){2}|。{3}/g, "…");
}

/** 「正在生成视频 (3/8)」这类进度行：同一前缀只保留一行，原地更新。 */
const PROGRESS = /^(.*?)\s*[（(](\d+)\s*\/\s*(\d+)[）)]\s*$/;

interface ProgressRun {
	entry: ActivityEntry;
	key: string;
	firstStep: number;
	firstAt?: number;
}

export function formatEta(ms: number): string {
	const s = Math.max(1, Math.round(ms / 1000));
	if (s < 60) return `约 ${s} 秒`;
	return `约 ${Math.round(s / 60)} 分钟`;
}

/**
 * 把 message feed 推导成步骤时间线（纯函数）。
 * - separator 开一轮运行；handoff 是阶段交接。
 * - step 开一个步骤；thinking / tool_* / *result 挂在当前步骤下（没有就新开一个）。
 * - 其余助手消息、用户消息、错误各占一行；助手消息不结束当前步骤。
 * - 耗时 = 步骤开始到它最后一条细节；没有细节时到下一条记录。
 * - `running` 为真时，最后一个步骤标记为进行中。
 */
export function deriveActivityTimeline(
	messages: readonly AgentMessage[],
	{ running = false }: { running?: boolean } = {},
): ActivityEntry[] {
	const entries: ActivityEntry[] = [];
	const starts: (number | undefined)[] = [];
	const ends: (number | undefined)[] = [];
	let openStep: ActivityEntry | null = null;
	let openIndex = -1;
	let progress: ProgressRun | null = null;
	const progressEntries: ActivityEntry[] = [];

	const push = (entry: ActivityEntry, msg: AgentMessage) => {
		entries.push(entry);
		starts.push(time(msg));
		ends.push(time(msg));
	};

	messages.forEach((msg, index) => {
		if (isNoise(msg)) return;
		const id = msg.id || `activity_${index}`;
		const agentLabel = AGENT_NAME_MAP[msg.agent] || msg.agent;
		const base = { id, agent: msg.agent, agentLabel, status: "done" as ActivityStatus, children: [] };

		const childLabel = CHILD_LABELS[msg.role];
		if (childLabel) {
			if (!openStep || openStep.agent !== msg.agent) {
				openStep = { ...base, kind: "step", title: agentLabel };
				push(openStep, msg);
				openIndex = entries.length - 1;
			}
			openStep.children.push({ id, label: childLabel, content: childContent(msg) });
			if (msg.isLoading) openStep.status = "running";
			ends[openIndex] = time(msg) ?? ends[openIndex];
			return;
		}

		// 助手的叙述不打断当前步骤：之后的工具行仍挂在这一步下
		if (msg.role !== "assistant" && msg.role !== "info") openStep = null;
		if (msg.role === "separator") {
			push({ ...base, kind: "run", title: "新一轮运行" }, msg);
		} else if (msg.role === "handoff") {
			push({ ...base, kind: "handoff", title: msg.content?.trim() || "阶段交接" }, msg);
		} else if (msg.role === "step") {
			openStep = { ...base, kind: "step", title: msg.content.trim(), status: msg.isLoading ? "running" : "done" };
			push(openStep, msg);
			openIndex = entries.length - 1;
		} else if (msg.role === "error") {
			push({ ...base, kind: "error", title: msg.content.trim(), detail: msg.details ?? undefined, status: "error" }, msg);
		} else if (msg.role === "user") {
			push({ ...base, kind: "user", title: msg.content.trim() }, msg);
		} else {
			const title = msg.content.trim();
			const match = PROGRESS.exec(title);
			if (match) {
				const [, prefix, stepText, totalText] = match;
				const step = Number(stepText);
				const total = Number(totalText);
				const key = `${msg.agent}|${prefix}|${total}`;
				const at = time(msg);
				if (progress && progress.key === key && entries.at(-1) === progress.entry) {
					progress.entry.title = title;
					// 剩余时间：按已完成的平均间隔粗估（当前这一项还在做，算进剩余）
					const done = step - progress.firstStep;
					progress.entry.detail =
						done > 0 && at !== undefined && progress.firstAt !== undefined && at > progress.firstAt
							? `剩余${formatEta(((at - progress.firstAt) / done) * (total - step + 1))}`
							: undefined;
					return;
				}
				const entry: ActivityEntry = { ...base, kind: "message", title, status: msg.isLoading ? "running" : "done" };
				push(entry, msg);
				progress = { entry, key, firstStep: step, firstAt: at };
				progressEntries.push(entry);
				return;
			}
			push({ ...base, kind: "message", title, status: msg.isLoading ? "running" : "done" }, msg);
		}
	});

	// 历史消息里的三个句点统一成省略号
	for (const entry of entries) {
		entry.title = tidyEllipsis(entry.title);
		for (const child of entry.children) child.content = tidyEllipsis(child.content);
	}

	// 剩余时间只给仍在跑的最后一条进度
	for (const entry of progressEntries) {
		if (!running || entry !== entries.at(-1)) delete entry.detail;
	}

	entries.forEach((entry, i) => {
		if (entry.kind !== "step") return;
		const start = starts[i];
		const last = ends[i];
		// 有细节行：到最后一条细节；否则到下一条记录
		const end = last !== undefined && start !== undefined && last > start ? last : (starts[i + 1] ?? last);
		if (start !== undefined && end !== undefined && end > start) entry.durationMs = end - start;
	});

	if (running) {
		for (let i = entries.length - 1; i >= 0; i--) {
			if (entries[i].kind === "step") {
				entries[i].status = "running";
				delete entries[i].durationMs;
				break;
			}
			if (entries[i].kind === "run") break;
		}
	}
	return entries;
}

export function formatDuration(ms: number): string {
	if (ms < 1000) return `${ms}ms`;
	const s = ms / 1000;
	if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`;
	return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}

/** A transient "doing X…" line: the live stream says the same thing, better. */
const TRANSIENT = /…$/;

/**
 * Put the streaming call inside the step it belongs to instead of a row of its
 * own: the running step of the same agent hosts it, and the trailing
 * "正在生成…" lines of that agent are dropped. Without such a step (or with
 * anything else after it) the stream keeps its own row.
 */
export function attachLiveStream(
	entries: ActivityEntry[],
	live: { agent: string; status: string } | null,
): { entries: ActivityEntry[]; host: ActivityEntry | null } {
	if (!live || live.status === "error") return { entries, host: null };
	let i = entries.length - 1;
	while (i >= 0 && entries[i].kind === "message" && entries[i].agent === live.agent && TRANSIENT.test(entries[i].title)) {
		i -= 1;
	}
	const host = entries[i];
	if (!host || host.kind !== "step" || host.status !== "running" || host.agent !== live.agent) {
		return { entries, host: null };
	}
	return { entries: entries.slice(0, i), host };
}
