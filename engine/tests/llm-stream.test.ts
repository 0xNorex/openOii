import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import SqliteDatabase from "better-sqlite3";
import { EngineDatabase } from "../src/db.js";
import { TextLlmService, type LlmStreamUpdate } from "../src/llm.js";
import { FAKE_STREAM_ERROR_TOKEN } from "../src/fake-stream.js";
import {
  LlmStreamSink,
  readableStreamText,
  tailCodePoints,
  type LlmStreamEvent,
} from "../src/pipeline/llm-stream.js";
import { installEngineRuntimeSchema } from "./test-db.js";

const SCHEMA = readFileSync(resolve(import.meta.dirname, "fixtures/app-schema.sql"), "utf8");

describe("readableStreamText", () => {
  it("shows JSON string values, not keys or identifiers", () => {
    const raw = '{"title":"午后的猫","acts":[{"act":1,"style":"anime","summary":"小猫醒来，\\"口渴\\"';
    expect(readableStreamText(raw)).toBe('午后的猫 · 小猫醒来，"口渴"');
  });

  it("drops a dangling escape in the open value", () => {
    expect(readableStreamText('{"summary":"第一行\\')).toBe("第一行");
    expect(readableStreamText('{"summary":"猫\\u72')).toBe("猫");
  });

  it("passes plain text through", () => {
    expect(readableStreamText("就是一段话")).toBe("就是一段话");
  });
});

describe("tailCodePoints", () => {
  it("never splits a surrogate pair", () => {
    const text = "猫🐱".repeat(200);
    const tail = tailCodePoints(text, 3);
    expect(tail).toBe("🐱猫🐱");
    expect(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(tail)).toBe(false);
  });
});

describe("LlmStreamSink", () => {
  it("throttles frames and keeps only the final one", () => {
    const published: Array<LlmStreamEvent & { seq: number }> = [];
    const compacted: Array<[string, number]> = [];
    let now = 0;
    const sink = new LlmStreamSink(
      {
        publish: (event) => {
          published.push({ ...event, seq: published.length + 1 });
          return published.length;
        },
        compact: (id, keep) => compacted.push([id, keep]),
      },
      "outline",
      () => now,
      100,
    );
    const update = (u: LlmStreamUpdate) => sink.update(u);
    update({ thinking: "想", text: "" });
    now = 50;
    update({ thinking: "想一想", text: "" });
    now = 120;
    update({ thinking: "想一想", text: '{"title":"猫' });
    sink.end("done");
    expect(published.map((e) => e.status)).toEqual(["streaming", "streaming", "done"]);
    expect(published[1]?.text).toBe("猫");
    expect(compacted).toEqual([[published[0]!.stream_id, 3]]);
  });
});

describe("fake provider streaming", () => {
  let dir: string | null = null;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  function fakeLlm(): TextLlmService {
    dir = mkdtempSync(join(tmpdir(), "openoii-stream-"));
    const file = join(dir, "o.db");
    const raw = new SqliteDatabase(file);
    raw.exec(SCHEMA);
    installEngineRuntimeSchema(raw);
    raw.close();
    return new TextLlmService(new EngineDatabase(file), {
      provider: "fake",
      model: "fake",
      base_url: null,
      reasoning_effort: null,
      credential_keys: [],
    } as never);
  }

  it("streams thinking then text deltas through pi-ai's event path", async () => {
    const updates: LlmStreamUpdate[] = [];
    const res = await fakeLlm().generate({
      system: "You are OutlineAgent.",
      prompt: JSON.stringify({ story: "猫" }),
      onStream: (u) => updates.push({ ...u }),
    });
    expect(updates.length).toBeGreaterThan(5);
    const last = updates.at(-1)!;
    expect(last.text).toBe(res.text);
    expect(last.thinking.length).toBeGreaterThan(0);
    // thinking arrives first and is complete before text starts
    const firstText = updates.findIndex((u) => u.text.length > 0);
    expect(updates[firstText]!.thinking).toBe(last.thinking);
    expect(JSON.parse(res.text)).toHaveProperty("agent", "outline");
  });

  it("can fail mid-stream after partial output", async () => {
    const updates: LlmStreamUpdate[] = [];
    await expect(
      fakeLlm().generate({
        system: "You are OutlineAgent.",
        prompt: JSON.stringify({ story: `猫 ${FAKE_STREAM_ERROR_TOKEN}` }),
        onStream: (u) => updates.push({ ...u }),
      }),
    ).rejects.toThrow(/fake 流式输出中断/);
    expect(updates.at(-1)!.text.length).toBeGreaterThan(0);
  });
});
