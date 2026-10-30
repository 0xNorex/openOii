import type { VideoJobHttp } from "./types.js";

export function jsonInit(headers: Record<string, string>, body: unknown): RequestInit {
  return { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) };
}

export function bearer(http: VideoJobHttp): Record<string, string> {
  return { Authorization: `Bearer ${http.apiKey}` };
}
