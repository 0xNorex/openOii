/**
 * Vidu：POST /ent/v2/text2video、/ent/v2/img2video（Authorization: Token），
 * GET /ent/v2/tasks/{id}/creations 轮询。
 * https://platform.vidu.cn/docs/api-reference/video-models/vidu-q3/text-to-video （2026-10-30 核对）
 */
import { fitRatio, joinUrl } from "./duration.js";
import { VideoJobError, readJson, record, text } from "./errors.js";
import { jsonInit } from "./http.js";
import type { VideoJobAdapter, VideoJobHttp } from "./types.js";

const label = "Vidu";
const token = (http: VideoJobHttp) => ({ Authorization: `Token ${http.apiKey}` });

export const vidu: VideoJobAdapter = {
  id: "vidu",
  label,
  durations(model) {
    if (/^viduq3/.test(model)) return { min: 1, max: 16 };
    if (/^viduq2/.test(model)) return { min: 1, max: 10 };
    if (/^viduq1/.test(model)) return [5];
    if (/^vidu2/.test(model)) return [4, 8];
    return { min: 1, max: 10 };
  },
  async submit(http, req) {
    const payload: Record<string, unknown> = { model: req.model, prompt: req.prompt, duration: req.duration };
    let path = "ent/v2/text2video";
    if (req.image) {
      // 图生视频跟随首帧画幅，没有 aspect_ratio；Base64 要带 data:image/...;base64, 前缀
      path = "ent/v2/img2video";
      payload.images = [req.image];
    } else {
      payload.aspect_ratio = fitRatio(["16:9", "9:16", "1:1", "4:3", "3:4"], req.ratio);
    }
    const response = await http.post(joinUrl(http.baseUrl, path), jsonInit(token(http), payload));
    const body = await readJson({ label }, "提交任务", response);
    if (text(body.state) === "failed") throw new VideoJobError(`${label}提交失败：${text(body.err_code) || "未知原因"}`);
    const id = text(body.task_id);
    if (!id) throw new VideoJobError(`${label}没有返回任务 ID`);
    return id;
  },
  async poll(http, taskId) {
    const url = joinUrl(http.baseUrl, `ent/v2/tasks/${encodeURIComponent(taskId)}/creations`);
    const body = await readJson({ label }, "查询任务", await http.request(url, { headers: token(http) }));
    const state = text(body.state);
    if (state === "success") {
      const creation = Array.isArray(body.creations) ? record(body.creations[0]) : {};
      const url = text(creation.url);
      return url ? { state: "done", result: { url } } : { state: "failed", message: `${label}任务成功但没有视频地址` };
    }
    if (state === "failed") return { state: "failed", message: `${label}生成失败：${text(body.err_code) || "未知原因"}` };
    return { state: "pending" };
  },
};
