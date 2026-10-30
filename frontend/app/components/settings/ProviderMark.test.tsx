import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ProviderMark } from "./ProviderPresetPanel";
import { presetById } from "./providerPresets";

describe("ProviderMark", () => {
	it("有 logo 时渲染单色遮罩，不显示文字标记", () => {
		const { container } = render(<ProviderMark preset={presetById("text", "deepseek")!} selected={false} />);
		const root = container.firstElementChild as HTMLElement;
		expect(root.dataset.logo).toBe("deepseek");
		const logo = root.querySelector(".provider-logo") as HTMLElement;
		expect(logo.style.getPropertyValue("--provider-logo")).toBe("url(/provider-logos/deepseek.svg)");
		expect(root.textContent).toBe("");
	});

	it("自定义没有 logo，退回文字标记；选中时用主色底", () => {
		const preset = presetById("text", "custom-openai")!;
		const { container } = render(<ProviderMark preset={preset} selected />);
		const root = container.firstElementChild as HTMLElement;
		expect(root.querySelector(".provider-logo")).toBeNull();
		expect(root.textContent).toBe(preset.mark);
		expect(root.className).toMatch(/bg-primary/);
	});
});
