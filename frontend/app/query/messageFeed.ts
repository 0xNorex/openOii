import type { AgentMessage, FeedbackReceipt, FeedbackReceiptState, Message } from "~/types";
import { appQueryClient } from "./client";
import { projectQueryKeys } from "./queryKeys";

/**
 * The project message feed lives in the query cache, not in Zustand.
 *
 * Messages are server-originated (hydrated once over HTTP, then appended from
 * durable websocket events), so keeping them in the UI store made them a second
 * copy of server state. Reads and writes now go through the same cache as every
 * other server-shaped value, which is what makes the single-reducer shape
 * possible: a websocket event updates the cache and components re-render.
 */
export function readMessageFeed(projectId: number): AgentMessage[] {
  return appQueryClient.getQueryData<AgentMessage[]>(projectQueryKeys.messageFeed(projectId)) ?? [];
}

export function appendMessage(projectId: number, message: AgentMessage): void {
  appQueryClient.setQueryData<AgentMessage[]>(
    projectQueryKeys.messageFeed(projectId),
    (current) => [...(current ?? []), message],
  );
}

export function replaceMessageFeed(projectId: number, messages: AgentMessage[]): void {
  appQueryClient.setQueryData<AgentMessage[]>(projectQueryKeys.messageFeed(projectId), messages);
}

export function clearMessageFeed(projectId: number): void {
  appQueryClient.setQueryData<AgentMessage[]>(projectQueryKeys.messageFeed(projectId), []);
}

/**
 * Apply a transformation only when it actually changes something, so a no-op
 * (e.g. "no loading messages to clear") does not churn the cache and re-render.
 */
export function updateMessageFeed(
  projectId: number,
  transform: (messages: AgentMessage[]) => AgentMessage[],
): void {
  const current = readMessageFeed(projectId);
  const next = transform(current);
  if (next.length === current.length && next.every((msg, index) => msg === current[index])) {
    return;
  }
  replaceMessageFeed(projectId, next);
}

const RECEIPT_STATES = new Set<FeedbackReceiptState>(["received", "regenerating", "revised", "not_applied", "failed"]);

/** A persisted `feedback_receipt` message row → the receipt the timeline shows. */
export function receiptFromMessageRow(message: Message): FeedbackReceipt | null {
  if (message.role !== "feedback_receipt") return null;
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(message.content) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!data || typeof data !== "object") return null;
  const id = typeof data.id === "string" ? data.id : message.summary;
  const state = data.state as FeedbackReceiptState;
  if (!id || !RECEIPT_STATES.has(state)) return null;
  const entityIds = Array.isArray(data.entity_ids)
    ? data.entity_ids.filter((value): value is number => typeof value === "number")
    : null;
  return {
    id,
    round: typeof data.round === "number" && data.round > 0 ? data.round : 1,
    state,
    content: typeof data.content === "string" ? data.content : "",
    reason: typeof data.reason === "string" ? data.reason : null,
    gate: typeof data.stage === "string" ? data.stage : typeof data.gate === "string" ? data.gate : null,
    entityType: typeof data.entity_type === "string" ? data.entity_type : null,
    entityIds: entityIds && entityIds.length ? entityIds : null,
  };
}

/** Server message rows → the feed, with persisted receipts as receipt cards. */
export function messagesToFeed(messages: Message[]): AgentMessage[] {
  const feed: AgentMessage[] = [];
  for (const message of messages) {
    if (message.role === "feedback_receipt") {
      const receipt = receiptFromMessageRow(message);
      if (!receipt) continue;
      feed.push({
        id: `receipt_${receipt.id}`,
        agent: "system",
        role: "feedback",
        content: receipt.content,
        receipt,
        timestamp: message.created_at,
      });
      continue;
    }
    feed.push({
      id: `db_${message.id}`,
      agent: message.agent,
      role: message.role,
      content: message.content,
      timestamp: message.created_at,
      progress: message.progress ?? undefined,
      isLoading: false,
    });
  }
  return feed;
}
