import { describe, expect, it } from "vitest";
import { recallFailedStream, rememberFailedStream, splitForReveal, tidyStreamText } from "./liveStream";

describe("splitForReveal", () => {
	it("types out only what is new when the snapshot grows", () => {
		expect(splitForReveal("午后", "午后的猫🐱")).toEqual({ base: "午后", pending: ["的", "猫", "🐱"] });
	});

	it("follows a sliding tail by its last characters", () => {
		const shown = "一二三四五六七八九十甲乙丙丁";
		const target = "五六七八九十甲乙丙丁戊己";
		expect(splitForReveal(shown, target)).toEqual({ base: "五六七八九十甲乙丙丁", pending: ["戊", "己"] });
	});

	it("jumps when the text changed completely", () => {
		expect(splitForReveal("思考中的内容", "{完全不同")).toEqual({ base: "{完全不同", pending: [] });
	});

	it("never splits a surrogate pair", () => {
		const { pending } = splitForReveal("", "🐱🐶");
		expect(pending).toEqual(["🐱", "🐶"]);
	});
});

describe("tidyStreamText", () => {
	it("hides a bare separator at either end, mid-typing or after the tail cut", () => {
		expect(tidyStreamText("午后的猫 · ")).toBe("午后的猫");
		expect(tidyStreamText("午后的猫 ·")).toBe("午后的猫");
		expect(tidyStreamText("· 醒来")).toBe("醒来");
		expect(tidyStreamText("午后 · 醒来")).toBe("午后 · 醒来");
	});
});

describe("failed stream across reloads", () => {
	const failed = { streamId: "s1", agent: "outline", status: "error" as const, thinking: "", text: "半句", chars: 9, error: "连接断开" };

	it("remembers an interrupted stream per project and forgets it on null", () => {
		rememberFailedStream(7, failed);
		expect(recallFailedStream(7)).toEqual(failed);
		expect(recallFailedStream(8)).toBeNull();
		rememberFailedStream(7, null);
		expect(recallFailedStream(7)).toBeNull();
	});

	it("never stores a stream that did not fail", () => {
		rememberFailedStream(7, { ...failed, status: "streaming" });
		expect(recallFailedStream(7)).toBeNull();
	});
});
