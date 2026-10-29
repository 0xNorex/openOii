/**
 * Raw run errors (engine/backend, mostly English) → one plain Chinese sentence.
 * The raw text stays available behind a disclosure for debugging.
 */
const RULES: Array<{ match: RegExp; text: string }> = [
	{ match: /engine restarted|executor that owned this run is gone/i, text: "执行引擎重启了，运行停在这里，可以继续" },
	{ match: /lease (missing or )?expired|execution lease lost/i, text: "执行中断（引擎租约过期），已完成的步骤都保留着，可以继续" },
	{ match: /等待确认超时/, text: "等待确认太久，运行已暂停，可以继续" },
	{ match: /structured llm output invalid|not a valid json/i, text: "文本模型返回的内容格式不对，重试一般就能好" },
	{ match: /流式输出中断|stream (was )?(interrupted|aborted)|premature close/i, text: "文本模型的输出中途断了，可以继续" },
	{ match: /\b429\b|rate.?limit|too many requests|quota/i, text: "模型服务限流或额度不足，稍后再继续" },
	{ match: /\b401\b|\b403\b|unauthorized|forbidden|invalid api key|authentication/i, text: "模型服务拒绝了请求，请检查设置里的 API Key" },
	{ match: /timed? ?out|timeout|ETIMEDOUT/i, text: "模型服务响应超时，可以继续" },
	{ match: /ECONNREFUSED|ENOTFOUND|fetch failed|network|socket hang up|connection (refused|reset)/i, text: "连不上模型服务，请检查网络或服务地址" },
	{ match: /\b5\d\d\b|bad gateway|service unavailable|internal server error/i, text: "模型服务暂时出错，可以稍后继续" },
	{ match: /content.?(policy|filter)|safety|moderation/i, text: "内容被模型服务的安全策略拦截，换个说法再试" },
	{ match: /cancel/i, text: "运行已被取消" },
];

export interface RunErrorDescription {
	/** User-facing sentence. */
	summary: string;
	/** Original error for the disclosure; null when the summary already is it. */
	raw: string | null;
}

const HAS_CJK = /[\u4e00-\u9fff]/;

export function describeRunError(raw: string | null | undefined): RunErrorDescription | null {
	const text = raw?.trim();
	if (!text) return null;
	for (const rule of RULES) {
		if (rule.match.test(text)) return { summary: rule.text, raw: text };
	}
	// Already Chinese and short: show it as is.
	if (HAS_CJK.test(text) && text.length <= 60) return { summary: text, raw: null };
	return { summary: "运行出错停下了，可以继续或取消", raw: text };
}
