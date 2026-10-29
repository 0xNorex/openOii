/**
 * Live preview of an LLM call: throttled `llm_stream` events carrying the tail
 * of the thinking and of the human-readable part of the reply. Frames are
 * snapshots, so each new one replaces the run's earlier frames in the event
 * log (error frames stay): streaming never grows the log by more than one row.
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
  /** Overall run progress (0..1) estimated from the output so far. */
  progress?: number;
}

export interface LlmStreamPublisher {
  /** Append a durable event; returns its seq. */
  publish(event: LlmStreamEvent): number;
  /** Drop the run's earlier non-error `llm_stream` events, keeping `keepSeq`. */
  compact(keepSeq: number): void;
}

/** Last `max` code points, never splitting a surrogate pair. */
export function tailCodePoints(text: string, max = STREAM_TAIL_CHARS): string {
  const points = Array.from(text);
  if (points.length <= max) return text;
  return points.slice(points.length - max).join("");
}

const IDENTIFIER = /^[A-Za-z0-9_.:/-]*$/;
/** Shorter values are labels (「起」「承转」, act numbers), not prose. */
const MIN_VALUE_CHARS = 3;

/**
 * The agents answer in JSON. Show the string values (titles, summaries,
 * descriptions) and hide keys, punctuation, short labels and identifier-like values. The
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
    if (Array.from(value).length < MIN_VALUE_CHARS || IDENTIFIER.test(value)) continue;
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
    private readonly progressFor?: (chars: number) => number,
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

  /** Final state of the call. */
  end(status: "done" | "error", error?: string): void {
    if (this.lastEmitAt === -Infinity && !this.pending && status === "done") return;
    this.flush(status, error);
  }

  private flush(status: LlmStreamStatus, error?: string): void {
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
    if (this.progressFor) event.progress = this.progressFor(event.chars);
    this.publisher.compact(this.publisher.publish(event));
  }
}
