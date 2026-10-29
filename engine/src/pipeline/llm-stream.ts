/**
 * Live preview of an LLM call: throttled `llm_stream` events carrying the tail
 * of the thinking and of the human-readable part of the reply. When the call
 * ends, only the final event is kept, so streaming does not bloat the event log.
 */
import { randomUUID } from "node:crypto";
import type { LlmStreamUpdate } from "../llm.js";

export const STREAM_TAIL_CHARS = 240;
export const STREAM_THROTTLE_MS = 200;

export type LlmStreamStatus = "streaming" | "done" | "error";

export interface LlmStreamEvent {
  stream_id: string;
  agent: string;
  status: LlmStreamStatus;
  thinking: string;
  text: string;
  chars: number;
  error?: string;
}

export interface LlmStreamPublisher {
  /** Append a durable event; returns its seq. */
  publish(event: LlmStreamEvent): number;
  /** Drop earlier events of this stream, keeping `keepSeq`. */
  compact(streamId: string, keepSeq: number): void;
}

/** Last `max` code points, never splitting a surrogate pair. */
export function tailCodePoints(text: string, max = STREAM_TAIL_CHARS): string {
  const points = Array.from(text);
  if (points.length <= max) return text;
  return points.slice(points.length - max).join("");
}

const IDENTIFIER = /^[A-Za-z0-9_.:/-]*$/;

/**
 * The agents answer in JSON. Show the string values (titles, summaries,
 * descriptions) and hide keys, punctuation and identifier-like values. The
 * last value may still be open; it is shown as it grows.
 */
export function readableStreamText(raw: string): string {
  const trimmed = raw.trimStart();
  if (!/^(```|\{|\[)/.test(trimmed)) return raw;
  const values: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)(")?/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(trimmed)) !== null) {
    const closed = match[2] === '"';
    const isKey = closed && /^\s*:/.test(trimmed.slice(re.lastIndex));
    if (isKey) continue;
    let value = match[1] ?? "";
    // A dangling backslash would make the partial value unparseable.
    if (!closed) value = value.replace(/\\(u[0-9a-fA-F]{0,3})?$/, "");
    try {
      value = JSON.parse(`"${value}"`) as string;
    } catch {
      // keep the raw slice
    }
    value = value.replace(/\s+/g, " ").trim();
    if (!value || IDENTIFIER.test(value)) continue;
    values.push(value);
  }
  return values.join(" · ");
}

export class LlmStreamSink {
  private readonly streamId = randomUUID();
  private last: LlmStreamUpdate = { thinking: "", text: "" };
  private lastEmitAt = -Infinity;
  private pending = false;

  constructor(
    private readonly publisher: LlmStreamPublisher,
    private readonly agent: string,
    private readonly now: () => number = Date.now,
    private readonly throttleMs = STREAM_THROTTLE_MS,
  ) {}

  /** Called on every delta; publishes at most once per throttle window. */
  readonly update = (update: LlmStreamUpdate): void => {
    this.last = update;
    this.pending = true;
    const now = this.now();
    if (now - this.lastEmitAt < this.throttleMs) return;
    this.lastEmitAt = now;
    this.flush("streaming");
  };

  /** Final state; earlier frames of this stream are compacted away. */
  end(status: "done" | "error", error?: string): void {
    if (this.lastEmitAt === -Infinity && !this.pending && status === "done") return;
    const seq = this.flush(status, error);
    this.publisher.compact(this.streamId, seq);
  }

  private flush(status: LlmStreamStatus, error?: string): number {
    this.pending = false;
    const event: LlmStreamEvent = {
      stream_id: this.streamId,
      agent: this.agent,
      status,
      thinking: tailCodePoints(this.last.thinking),
      text: tailCodePoints(readableStreamText(this.last.text)),
      chars: this.last.text.length,
    };
    if (error) event.error = error;
    return this.publisher.publish(event);
  }
}
