import { describe, expect, it } from "vitest";
import { INITIAL_RUN_STATE } from "~/query/runState";
import { GATE_POLL_MS, runStateRefetchInterval } from "./useRunState";

describe("runStateRefetchInterval", () => {
	it("polls runs/current only while parked at an approval gate", () => {
		expect(runStateRefetchInterval(undefined)).toBe(false);
		expect(runStateRefetchInterval({ ...INITIAL_RUN_STATE, isGenerating: true })).toBe(false);
		expect(runStateRefetchInterval({ ...INITIAL_RUN_STATE, isGenerating: true, awaitingConfirm: true })).toBe(GATE_POLL_MS);
		expect(GATE_POLL_MS).toBeLessThanOrEqual(30_000);
	});
});
