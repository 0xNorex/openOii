import { describe, expect, it } from "vitest";
import { describeRunError } from "./runErrors";

describe("describeRunError", () => {
	it("maps the common engine errors to plain Chinese and keeps the raw text", () => {
		expect(describeRunError("Execution lease expired; run is safe to resume")).toEqual({
			summary: "执行中断（引擎租约过期），已完成的步骤都保留着，可以继续",
			raw: "Execution lease expired; run is safe to resume",
		});
		expect(describeRunError("Engine restarted; the executor that owned this run is gone; run is safe to resume")?.summary).toBe(
			"执行引擎重启了，运行停在这里，可以继续",
		);
		expect(describeRunError("structured LLM output invalid after one repair (LLM output is not a valid JSON object)")?.summary).toContain("格式不对");
		expect(describeRunError("HTTP 429 Too Many Requests")?.summary).toContain("限流");
		expect(describeRunError("llm error: fake 流式输出中断（测试用）")?.summary).toContain("中途断了");
	});

	it("never shows raw English as the headline", () => {
		const unknown = describeRunError("TypeError: Cannot read properties of undefined (reading 'x')");
		expect(unknown?.summary).toBe("运行出错停下了，可以继续或取消");
		expect(unknown?.raw).toContain("TypeError");
	});

	it("passes short Chinese errors through and ignores blanks", () => {
		expect(describeRunError("分镜数量不足")).toEqual({ summary: "分镜数量不足", raw: null });
		expect(describeRunError("  ")).toBeNull();
		expect(describeRunError(null)).toBeNull();
	});
});
