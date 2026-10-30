/**
 * 阿里云百炼 · 通义万相：POST /services/aigc/video-generation/video-synthesis
 * （X-DashScope-Async: enable），GET /tasks/{id} 轮询，video_url 24 小时有效。
 * wan2.7 是新版协议（resolution + ratio；图生视频用 media 数组），
 * wan2.6 及更早是旧版协议（文生视频用 size；图生视频用 img_url）。
 * https://help.aliyun.com/zh/model-studio/text-to-video-api-reference
 * https://help.aliyun.com/zh/model-studio/image-to-video-general-api-reference （2026-10-30 核对）
 */
import { fitRatio, joinUrl } from "./duration.js";
import { VideoJobError, readJson, record, text } from "./errors.js";
import { bearer, jsonInit } from "./http.js";
import type { VideoJobAdapter } from "./types.js";

const label = "通义万相";
const RATIOS = ["16:9", "9:16", "1:1", "4:3", "3:4"];
const SIZE_720: Record<string, string> = { "16:9": "1280*720", "9:16": "720*1280", "1:1": "960*960", "4:3": "1088*832", "3:4": "832*1088" };
const SIZE_1080: Record<string, string> = { "16:9": "1920*1080", "9:16": "1080*1920", "1:1": "1440*1440", "4:3": "1632*1248", "3:4": "1248*1632" };

function durations(model: string) {
  if (/^wan2\.[67]/.test(model)) return { min: 2, max: 15 };
  if (/^wan2\.5/.test(model)) return [5, 10];
  return [5];
}

export const dashscope: VideoJobAdapter = {
  id: "dashscope",
  label,
  durations,
  async submit(http, req) {
    const modern = /^wan2\.7/.test(req.model);
    // wan2.2 只有 480P / 1080P 档，其余用 720P
    const resolution = /^wan2\.2/.test(req.model) ? "1080P" : "720P";
    const fixed = Array.isArray(durations(req.model)) && (durations(req.model) as number[]).length === 1;
    const parameters: Record<string, unknown> = fixed ? {} : { duration: req.duration };
    const input: Record<string, unknown> = { prompt: req.prompt };
    let model = req.model;
    if (req.image) {
      model = req.model.replace("-t2v", "-i2v");
      parameters.resolution = resolution;
      if (modern) input.media = [{ type: "first_frame", url: req.image }];
      else input.img_url = req.image;
    } else if (modern) {
      parameters.resolution = resolution;
      parameters.ratio = fitRatio(RATIOS, req.ratio);
    } else {
      parameters.size = (resolution === "1080P" ? SIZE_1080 : SIZE_720)[fitRatio(RATIOS, req.ratio)];
    }
    const url = joinUrl(http.baseUrl, "services/aigc/video-generation/video-synthesis");
    const response = await http.post(url, jsonInit({ ...bearer(http), "X-DashScope-Async": "enable" }, { model, input, parameters }));
    const body = await readJson({ label }, "提交任务", response);
    const id = text(record(body.output).task_id);
    if (!id) throw new VideoJobError(`${label}没有返回任务 ID：${text(body.message).slice(0, 200)}`);
    return id;
  },
  async poll(http, taskId) {
    const url = joinUrl(http.baseUrl, `tasks/${encodeURIComponent(taskId)}`);
    const output = record((await readJson({ label }, "查询任务", await http.request(url, { headers: bearer(http) }))).output);
    const status = text(output.task_status);
    if (status === "SUCCEEDED") {
      const video = text(output.video_url);
      return video ? { state: "done", result: { url: video } } : { state: "failed", message: `${label}任务成功但没有视频地址` };
    }
    if (status === "FAILED" || status === "CANCELED" || status === "UNKNOWN") {
      const detail = [text(output.code), text(output.message)].filter(Boolean).join(" ").slice(0, 200);
      return { state: "failed", message: `${label}任务${status === "UNKNOWN" ? "不存在或已过期" : "失败"}${detail ? `：${detail}` : ""}` };
    }
    return { state: "pending" };
  },
};
