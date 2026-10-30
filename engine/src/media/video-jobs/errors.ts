import type { VideoJobAdapter } from "./types.js";

/** 服务商返回的错误：status 为 HTTP 状态码，0 表示业务错误码。 */
export class VideoJobError extends Error {
  constructor(
    message: string,
    readonly status = 0,
    readonly retryable = false,
  ) {
    super(message);
    this.name = "VideoJobError";
  }
}

const STATUS_TEXT: Record<number, string> = {
  400: "请求参数不被支持（检查模型名、时长、画幅）",
  401: "API Key 无效或与地域不匹配",
  402: "余额不足",
  403: "没有权限：未开通该模型、未实名或已欠费",
  404: "接口地址或任务不存在（检查 Base URL）",
  429: "请求太频繁或额度已用完",
};

export function statusText(status: number): string {
  return STATUS_TEXT[status] ?? (status >= 500 ? "服务端暂时不可用" : `HTTP ${status}`);
}

/** 服务商的原文只截取前 200 个字符，避免把大段响应写进日志。 */
export function vendorDetail(text: unknown): string {
  const value = typeof text === "string" ? text : text == null ? "" : JSON.stringify(text);
  return value.replace(/\s+/g, " ").trim().slice(0, 200);
}

export function vendorError(adapter: Pick<VideoJobAdapter, "label">, what: string, status: number, detail = ""): VideoJobError {
  const suffix = detail ? `：${vendorDetail(detail)}` : "";
  return new VideoJobError(
    `${adapter.label}${what}失败（${statusText(status)}）${suffix}`,
    status,
    status === 408 || status === 429 || status >= 500,
  );
}

/** 读取 JSON；非 2xx 时抛出带中文原因的错误。 */
export async function readJson(
  adapter: Pick<VideoJobAdapter, "label">,
  what: string,
  response: Response,
): Promise<Record<string, unknown>> {
  const text = await response.text();
  let body: Record<string, unknown> = {};
  try {
    const parsed: unknown = text ? JSON.parse(text) : {};
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) body = parsed as Record<string, unknown>;
  } catch {
    if (response.ok) throw new VideoJobError(`${adapter.label}${what}返回了无法解析的内容`);
  }
  if (!response.ok) {
    const error = body.error && typeof body.error === "object" ? (body.error as Record<string, unknown>) : null;
    const detail = error?.message ?? body.message ?? body.msg ?? body.err_code ?? body.code ?? text;
    throw vendorError(adapter, what, response.status, String(detail ?? ""));
  }
  return body;
}

export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

export function text(value: unknown): string {
  return typeof value === "string" ? value : typeof value === "number" ? String(value) : "";
}
