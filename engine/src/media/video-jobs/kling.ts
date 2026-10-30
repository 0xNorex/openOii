/**
 * 可灵（新版 API Key 标准）：POST /text-to-video/{model}、/image-to-video/{model}，
 * GET /tasks?task_ids= 轮询。旧版 AK/SK（JWT）接口不接入。
 * https://kling.ai/document-api/api/video/4-0/text-to-video （2026-10-30 核对）
 */
import { fitRatio, joinUrl, splitDataUrl } from "./duration.js";
import { VideoJobError, readJson, record, text } from "./errors.js";
import { bearer, jsonInit } from "./http.js";
import type { VideoJobAdapter, VideoJobHttp } from "./types.js";

const label = "可灵";

function businessError(body: Record<string, unknown>): void {
  const code = Number(body.code ?? 0);
  if (!code) return;
  const reason =
    code >= 1000 && code < 1100
      ? "API Key 无效"
      : code >= 1100 && code < 1200
        ? "账户异常或余额不足"
        : code >= 1300 && code < 1400
          ? "触发限流或内容安全策略"
          : `错误码 ${code}`;
  throw new VideoJobError(`${label}请求失败（${reason}）：${text(body.message).slice(0, 200)}`);
}

async function call(http: VideoJobHttp, what: string, response: Promise<Response>) {
  const body = await readJson({ label }, what, await response);
  businessError(body);
  return body;
}

export const kling: VideoJobAdapter = {
  id: "kling",
  label,
  durations(model) {
    if (/^kling-4/.test(model)) return { min: 3, max: 30 };
    if (/^kling-3/.test(model)) return { min: 3, max: 15 };
    return [5, 10];
  },
  async submit(http, req) {
    const settings: Record<string, unknown> = { resolution: "720p", duration: req.duration };
    const model = encodeURIComponent(req.model);
    let path: string;
    let payload: Record<string, unknown>;
    if (req.image) {
      // 文档写的是「URL 或 Base64」：Base64 按原始编码传，不带 data: 前缀
      const inline = splitDataUrl(req.image);
      path = `image-to-video/${model}`;
      payload = {
        contents: [
          { type: "prompt", text: req.prompt },
          { type: "first_frame", url: inline ? inline.base64 : req.image },
        ],
        settings,
      };
    } else {
      const ratios = /^kling-4/.test(req.model) ? ["16:9", "9:16", "1:1", "21:9"] : ["16:9", "9:16", "1:1"];
      settings.aspect_ratio = fitRatio(ratios, req.ratio);
      path = `text-to-video/${model}`;
      payload = { prompt: req.prompt, settings };
    }
    const body = await call(http, "提交任务", http.post(joinUrl(http.baseUrl, path), jsonInit(bearer(http), payload)));
    const id = text(record(body.data).id);
    if (!id) throw new VideoJobError(`${label}没有返回任务 ID`);
    return id;
  },
  async poll(http, taskId) {
    const url = joinUrl(http.baseUrl, `tasks?task_ids=${encodeURIComponent(taskId)}`);
    const body = await call(http, "查询任务", http.request(url, { headers: bearer(http) }));
    const task = record(Array.isArray(body.data) ? body.data[0] : body.data);
    const status = text(task.status);
    if (status === "succeeded") {
      const outputs = Array.isArray(task.outputs) ? task.outputs.map(record) : [];
      const video = outputs.find((item) => item.type === "video" && text(item.url)) ?? outputs.find((item) => text(item.url));
      if (!video) return { state: "failed", message: `${label}任务成功但没有视频地址` };
      return { state: "done", result: { url: text(video.url) } };
    }
    if (status === "failed") return { state: "failed", message: `${label}生成失败：${text(task.message).slice(0, 200) || "未知原因"}` };
    return { state: "pending" };
  },
};
