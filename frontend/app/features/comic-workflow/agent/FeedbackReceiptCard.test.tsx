import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { FeedbackReceipt } from "~/types";
import { FeedbackReceiptCard, receiptSteps } from "./FeedbackReceiptCard";
import { deriveSyncTone, formatAgo, STALE_AFTER_MS } from "./SyncStatus";

const receipt = (patch: Partial<FeedbackReceipt> = {}): FeedbackReceipt => ({
	id: "fb1",
	round: 1,
	state: "received",
	content: "结局更温暖",
	reason: null,
	gate: "shot_images_approval",
	...patch,
});

describe("FeedbackReceiptCard", () => {
	it("walks 已收到 → 重做中 → 新版本待确认", () => {
		expect(receiptSteps(receipt()).map((s) => s.state)).toEqual(["current", "todo", "todo"]);
		expect(receiptSteps(receipt({ state: "regenerating" })).map((s) => s.state)).toEqual(["done", "current", "todo"]);
		const revised = receiptSteps(receipt({ state: "revised" }));
		expect(revised.map((s) => s.state)).toEqual(["done", "done", "current"]);
		expect(revised[2].label).toBe("第 2 版待确认");
	});

	it("shows the reason when the feedback was not applied", () => {
		render(<FeedbackReceiptCard receipt={receipt({ state: "not_applied", reason: "请先选中镜头" })} />);
		const card = screen.getByTestId("feedback-receipt");
		expect(card).toHaveAttribute("data-state", "not_applied");
		expect(card).toHaveTextContent("结局更温暖");
		expect(card).toHaveTextContent("请先选中镜头");
		expect(card).toHaveTextContent("未采纳");
	});
});

describe("SyncStatus helpers", () => {
	it("formats elapsed time", () => {
		expect(formatAgo(1000)).toBe("刚刚");
		expect(formatAgo(12_000)).toBe("12 秒前");
		expect(formatAgo(125_000)).toBe("2 分钟前");
	});

	it("flags offline and silent runs", () => {
		expect(deriveSyncTone({ link: "closed", lastAt: 0, now: 1, expectingEvents: false })).toBe("offline");
		expect(deriveSyncTone({ link: "open", lastAt: 0, now: STALE_AFTER_MS + 1, expectingEvents: true })).toBe("stale");
		expect(deriveSyncTone({ link: "open", lastAt: 0, now: STALE_AFTER_MS + 1, expectingEvents: false })).toBe("ok");
	});
});
