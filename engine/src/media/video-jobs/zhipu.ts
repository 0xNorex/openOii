/**
 * 智谱 CogVideoX：POST /videos/generations，GET /async-result/{id} 轮询。
 * https://docs.bigmodel.cn/api-reference/模型-api/视频生成异步 （2026-10-30 核对）
 */
import { fitRatio, joinUrl } from "./duration.js";
import { VideoJobError, readJson, record, text } from "./errors.js";
import { bearer, jsonInit } from "./http.js";
import type { VideoJobAdapter } from "./types.js";

const label = "智谱 CogVideoX";
const SIZE: Record<string, string> = { "16:9": "1920x1080", "9:16": "1080x1920", "1:1": "1024x1024" };

export const zhipu: VideoJobAdapter = {
  id: "zhipu",
  label,
  durations: () => [5, 10],
  async submit(http, req) {
    // 提示词上限 512 字符
    const payload: Record<string, unknown> = { model: req.model, prompt: req.prompt.slice(0, 512), duration: req.duration };
    if (req.image) payload.image_url = req.image;
    else payload.size = SIZE[fitRatio(Object.keys(SIZE), req.ratio)];
    const response = await http.post(joinUrl(http.baseUrl, "videos/generations"), jsonInit(bearer(http), payload));
    const body = await readJson({ label }, "提交任务", response);
    const id = text(body.id);
    if (!id) throw new VideoJobError(`${label}没有返回任务 ID`);
    return id;
  },
  async poll(http, taskId) {
    const url = joinUrl(http.baseUrl, `async-result/${encodeURIComponent(taskId)}`);
    const body = await readJson({ label }, "查询任务", await http.request(url, { headers: bearer(http) }));
    const status = text(body.task_status);
    if (status === "SUCCESS") {
      const video = Array.isArray(body.video_result) ? record(body.video_result[0]) : {};
      const url = text(video.url);
      return url ? { state: "done", result: { url } } : { state: "failed", message: `${label}任务成功但没有视频地址` };
    }
    if (status === "FAIL") return { state: "failed", message: `${label}生成失败` };
    return { state: "pending" };
  },
};
