import { describe, expect, it } from "vitest";
import { splitForReveal } from "./liveStream";

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
