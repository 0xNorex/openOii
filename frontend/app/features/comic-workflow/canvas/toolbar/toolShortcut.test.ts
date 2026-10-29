import { describe, expect, it } from "vitest";
import { toolForKey } from "./toolShortcut";

const ev = (key: string, extra: Partial<KeyboardEvent> = {}, target: Element | null = document.body) =>
	({ key, metaKey: false, ctrlKey: false, altKey: false, target, ...extra }) as KeyboardEvent;

describe("toolForKey", () => {
	it("maps V / H to the select and hand tools", () => {
		expect(toolForKey(ev("v"))).toBe("select");
		expect(toolForKey(ev("H"))).toBe("hand");
		expect(toolForKey(ev("x"))).toBeNull();
	});
	it("ignores modified keys (⌘V paste) and typing", () => {
		expect(toolForKey(ev("v", { metaKey: true }))).toBeNull();
		expect(toolForKey(ev("v", { ctrlKey: true }))).toBeNull();
		expect(toolForKey(ev("h", {}, document.createElement("textarea")))).toBeNull();
		expect(toolForKey(ev("h", {}, document.createElement("input")))).toBeNull();
	});
});
