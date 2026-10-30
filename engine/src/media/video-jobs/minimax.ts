/**
 * MiniMax 海螺：POST /v1/video_generation，GET /v1/query/video_generation 轮询，
 * 成功后用 file_id 调 GET /v1/files/retrieve 换下载地址（1 小时有效）。
 * 业务错误放在 HTTP 200 的 base_resp.status_code 里。
 * https://platform.minimax.io/docs/api-reference/video-generation-t2v （2026-10-30 核对）
 */
import { joinUrl } from "./duration.js";
import { VideoJobError, readJson, record, text } from "./errors.js";
import { bearer, jsonInit } from "./http.js";
import type { VideoJobAdapter, VideoJobHttp } from "./types.js";

const label = "MiniMax";
const CODES: Record<number, string> = {
  1002: "触发限流，稍后再试",
  1004: "鉴权失败，检查 API Key 和站点（国内 / 海外）",
  1008: "余额不足",
  1026: "提示词含敏感内容",
  2013: "参数不被支持",
  2049: "API Key 无效",
};

async function call(http: VideoJobHttp, what: string, response: Promise<Response>) {
  const body = await readJson({ label }, what, await response);
  const base = record(body.base_resp);
  const code = Number(base.status_code ?? 0);
  if (code) {
    throw new VideoJobError(`${label}${what}失败（${CODES[code] ?? `错误码 ${code}`}）：${text(base.status_msg).slice(0, 200)}`, 0, code === 1002);
  }
  return body;
}

export const minimax: VideoJobAdapter = {
  id: "minimax",
  label,
  // Hailuo-2.3 / 02：6 或 10 秒（10 秒只有 768P，默认就是 768P）；01 系列固定 6 秒
  durations: (model) => (/hailuo-(2\.3|02)/i.test(model) ? [6, 10] : [6]),
  async submit(http, req) {
    // 没有画幅参数：文生视频按模型默认，图生视频跟随首帧
    const payload: Record<string, unknown> = { model: req.model, prompt: req.prompt.slice(0, 2000), duration: req.duration };
    if (req.image) payload.first_frame_image = req.image;
    const body = await call(http, "提交任务", http.post(joinUrl(http.baseUrl, "video_generation"), jsonInit(bearer(http), payload)));
    const id = text(body.task_id);
    if (!id) throw new VideoJobError(`${label}没有返回任务 ID`);
    return id;
  },
  async poll(http, taskId) {
    const url = joinUrl(http.baseUrl, `query/video_generation?task_id=${encodeURIComponent(taskId)}`);
    const body = await call(http, "查询任务", http.request(url, { headers: bearer(http) }));
    const status = text(body.status);
    if (status === "Fail") return { state: "failed", message: `${label}生成失败` };
    if (status !== "Success") return { state: "pending" };
    const fileId = text(body.file_id);
    if (!fileId) return { state: "failed", message: `${label}任务成功但没有 file_id` };
    const fileUrl = joinUrl(http.baseUrl, `files/retrieve?file_id=${encodeURIComponent(fileId)}`);
    const file = record((await call(http, "获取文件", http.request(fileUrl, { headers: bearer(http) }))).file);
    const download = text(file.download_url);
    return download ? { state: "done", result: { url: download } } : { state: "failed", message: `${label}没有返回下载地址` };
  },
};
