import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MonoRuns } from "./MonoRuns";

describe("MonoRuns", () => {
	it("只把数字/拉丁片段包进 font-mono，汉字留在外层", () => {
		const { container } = render(
			<p>
				<MonoRuns text="3 章节 · 2 角色" />
			</p>,
		);
		const monos = [...container.querySelectorAll(".font-mono")].map((el) => el.textContent);
		expect(monos).toEqual(["3 ", " · 2 "]);
		expect(container.textContent).toBe("3 章节 · 2 角色");
		for (const el of container.querySelectorAll(".font-mono")) expect(el.textContent).not.toMatch(/[\u4e00-\u9fff]/);
	});
});
