import { VideoJobError } from "./errors.js";
import type { VideoJobAdapter, VideoJobHttp, VideoJobRequest, VideoJobResult } from "./types.js";

export interface VideoJobRunOptions {
  pollMs: number;
  maxWaitMs: number;
  /** 可取消的等待（MediaService.wait） */
  wait(ms: number): Promise<void>;
  /** 每轮轮询前检查取消 */
  throwIfAborted(): void;
  isAborted(): boolean;
  now?: () => number;
}

const MAX_POLL_FAILURES = 5;

/**
 * 提交一次，然后按 pollMs 轮询直到完成、失败、取消或超时。
 * 网络错误和 429 / 5xx 视为暂时性故障，退避后继续，连续 5 次才放弃。
 * 取消只停止本地轮询：这些服务商大多没有取消已排队任务的接口。
 */
export async function runVideoJob(
  adapter: VideoJobAdapter,
  http: VideoJobHttp,
  request: VideoJobRequest,
  options: VideoJobRunOptions,
): Promise<VideoJobResult> {
  const now = options.now ?? Date.now;
  options.throwIfAborted();
  const taskId = await adapter.submit(http, request);
  const deadline = now() + options.maxWaitMs;
  let failures = 0;
  while (now() < deadline) {
    await options.wait(options.pollMs * (failures ? 2 ** Math.min(failures, 4) : 1));
    options.throwIfAborted();
    let state;
    try {
      state = await adapter.poll(http, taskId, request);
    } catch (error) {
      if (options.isAborted()) throw error;
      const transient = error instanceof VideoJobError ? error.retryable : !(error instanceof Error && error.name === "AiOperationError");
      if (!transient || ++failures >= MAX_POLL_FAILURES) throw error;
      continue;
    }
    failures = 0;
    if (state.state === "done") return state.result;
    if (state.state === "failed") throw new VideoJobError(state.message);
  }
  throw new VideoJobError(`${adapter.label}视频生成超时（${Math.round(options.maxWaitMs / 60_000)} 分钟内没有完成）`);
}
