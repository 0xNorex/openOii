import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProviderMark } from "./ProviderPresetPanel";
import { presetById } from "./providerPresets";

describe("ProviderMark", () => {
	it("有 logo 时把品牌彩色 SVG 放进浅色方块，不显示文字标记", () => {
		const { container } = render(<ProviderMark preset={presetById("text", "deepseek")!} selected={false} />);
		const root = container.firstElementChild as HTMLElement;
		expect(root.dataset.logo).toBe("deepseek");
		expect(root.className).toContain("provider-tile");
		expect(root.dataset.baked).toBeUndefined();
		expect(root.querySelector("img")?.getAttribute("src")).toBe("/provider-logos/deepseek.svg");
		expect(root.textContent).toBe("");
	});

	it("只有单色标的品牌用烘焙好底色的方块，铺满不留边", () => {
		const { container } = render(<ProviderMark preset={presetById("text", "openai")!} selected={false} />);
		expect((container.firstElementChild as HTMLElement).dataset.baked).toBe("true");
	});

	it("自定义没有 logo，退回文字标记；选中时用主色底", () => {
		const preset = presetById("text", "custom-openai")!;
		const { container } = render(<ProviderMark preset={preset} selected />);
		const root = container.firstElementChild as HTMLElement;
		expect(root.querySelector("img")).toBeNull();
		expect(root.textContent).toBe(preset.mark);
		expect(root.className).toMatch(/bg-primary/);
	});
});
