import { describe, expect, it } from "vitest";
import type { ArtifactVersion } from "~/types";
import { previousVersion } from "./GenerationSection";

const v = (version: number) =>
	({ id: version, entity_type: "shot", entity_id: 1, version, snapshot: {}, trigger: "generation", created_at: "" }) as ArtifactVersion;

describe("previousVersion", () => {
	it("is the one before the newest, so pressing again toggles back", () => {
		expect(previousVersion([v(1), v(2)])?.version).toBe(1);
		// 换回 v1 之后多出 v3（= v1），上一版就成了重做的 v2
		expect(previousVersion([v(3), v(1), v(2)])?.version).toBe(2);
	});

	it("is null with a single version", () => {
		expect(previousVersion([v(1)])).toBeNull();
		expect(previousVersion([])).toBeNull();
	});
});
