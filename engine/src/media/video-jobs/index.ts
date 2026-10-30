import { dashscope } from "./dashscope.js";
import { fitDuration } from "./duration.js";
import { kling } from "./kling.js";
import { minimax } from "./minimax.js";
import type { VideoJobAdapter } from "./types.js";
import { veo } from "./veo.js";
import { vidu } from "./vidu.js";
import { zhipu } from "./zhipu.js";

export { runVideoJob } from "./runner.js";
export { VideoJobError } from "./errors.js";
export type { VideoJobAdapter, VideoJobHttp, VideoJobRequest, VideoJobResult, VideoJobState } from "./types.js";

export const VIDEO_JOB_ADAPTERS: Record<string, VideoJobAdapter> = { kling, vidu, zhipu, minimax, dashscope, veo };

export type VideoJobProvider = "kling" | "vidu" | "zhipu" | "minimax" | "dashscope" | "veo";

export function isVideoJobProvider(value: string): value is VideoJobProvider {
  return Object.hasOwn(VIDEO_JOB_ADAPTERS, value);
}

/** 服务商原生接口的时长取值；不认识的 provider 返回 null。 */
export function videoJobDuration(provider: string, model: string, seconds: number): number | null {
  const adapter = VIDEO_JOB_ADAPTERS[provider];
  return adapter ? fitDuration(adapter.durations(model), seconds) : null;
}
