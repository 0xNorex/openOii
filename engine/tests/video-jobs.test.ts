/**
 * 服务商原生视频接口（Kling / Vidu / CogVideoX / MiniMax / 通义万相 / Veo）：
 * 只用内存里的假 HTTP 检查请求形状、轮询解析、中文错误、时长 / 画幅映射，
 * 以及 runner 的超时、退避、取消。不发任何真实请求。
 */
import { describe, expect, it } from "vitest";
import { VIDEO_JOB_ADAPTERS, VideoJobError, isVideoJobProvider, runVideoJob, videoJobDuration } from "../src/media/video-jobs/index.js";
import type { VideoJobHttp, VideoJobRequest } from "../src/media/video-jobs/index.js";
import { fitDuration, fitRatio } from "../src/media/video-jobs/duration.js";
import { normalizeVideoDuration } from "../src/media/media.js";

const KEY = "sk-test-SECRET-1234567890";
const PNG = "data:image/png;base64,iVBORw0KGgo=";

type Call = { method: string; url: string; headers: Record<string, string>; body: Record<string, unknown> | null };
type Reply = { status?: number; body: unknown };

function fakeHttp(baseUrl: string, routes: (call: Call) => Reply | undefined) {
  const calls: Call[] = [];
  const handle = async (url: string, init: RequestInit = {}) => {
    const call: Call = {
      method: init.method ?? "GET",
      url,
      headers: Object.fromEntries(Object.entries((init.headers as Record<string, string>) ?? {}).map(([k, v]) => [k.toLowerCase(), v])),
      body: typeof init.body === "string" ? (JSON.parse(init.body) as Record<string, unknown>) : null,
    };
    calls.push(call);
    const reply = routes(call) ?? { status: 404, body: { message: "no route" } };
    return new Response(JSON.stringify(reply.body), { status: reply.status ?? 200 });
  };
  const http: VideoJobHttp = { baseUrl, apiKey: KEY, post: handle, request: handle };
  return { http, calls };
}

const req = (over: Partial<VideoJobRequest> = {}): VideoJobRequest => ({
  model: "m",
  prompt: "雨夜里的灯笼",
  image: null,
  duration: 5,
  ratio: "16:9",
  ...over,
});

const fast = { pollMs: 1, maxWaitMs: 5_000, wait: async () => undefined, throwIfAborted: () => undefined, isAborted: () => false };

describe("duration / ratio mapping", () => {
  it("clamps ranges and snaps lists to the nearest (ties go longer)", () => {
    expect(fitDuration({ min: 3, max: 15 }, 40)).toBe(15);
    expect(fitDuration({ min: 2, max: 15 }, 1.4)).toBe(2);
    expect(fitDuration([4, 6, 8], 5)).toBe(6);
    expect(fitDuration([5, 10], 7.5)).toBe(10);
    expect(fitDuration([6], 30)).toBe(6);
    expect(fitRatio(["16:9", "9:16"], "1:1")).toBe("16:9");
  });

  it("uses each vendor's per-model rules", () => {
    expect(videoJobDuration("kling", "kling-4.0", 25)).toBe(25);
    expect(videoJobDuration("kling", "kling-3.0", 25)).toBe(15);
    expect(videoJobDuration("kling", "kling-2.6", 7)).toBe(5);
    expect(videoJobDuration("vidu", "viduq3-pro", 20)).toBe(16);
    expect(videoJobDuration("zhipu", "cogvideox-3", 8)).toBe(10);
    expect(videoJobDuration("minimax", "MiniMax-Hailuo-2.3", 9)).toBe(10);
    expect(videoJobDuration("minimax", "T2V-01", 9)).toBe(6);
    expect(videoJobDuration("dashscope", "wan2.7-t2v", 12)).toBe(12);
    expect(videoJobDuration("dashscope", "wan2.5-t2v-preview", 6)).toBe(5);
    expect(videoJobDuration("dashscope", "wan2.2-t2v-plus", 9)).toBe(5);
    expect(videoJobDuration("veo", "veo-3.1-generate-001", 5)).toBe(6);
    expect(videoJobDuration("openai", "x", 5)).toBeNull();
    expect(normalizeVideoDuration("veo", 3, "veo-3.1-generate-001")).toBe(4);
    expect(normalizeVideoDuration("doubao", 7)).toBe(5);
    expect(isVideoJobProvider("kling")).toBe(true);
    expect(isVideoJobProvider("toString")).toBe(false);
  });
});

describe("Kling", () => {
  const base = "https://api-beijing.klingai.com";
  const routes = (call: Call): Reply | undefined => {
    if (call.method === "POST") return { body: { code: 0, message: "SUCCEED", data: { id: "k1", status: "submitted" } } };
    if (call.url.includes("/tasks?task_ids=k1"))
      return { body: { code: 0, data: [{ status: "succeeded", outputs: [{ type: "video", url: "https://cdn.kling/v.mp4" }] }] } };
    return undefined;
  };

  it("text-to-video: model in the path, settings with aspect / duration, Bearer key", async () => {
    const { http, calls } = fakeHttp(base, routes);
    const result = await runVideoJob(VIDEO_JOB_ADAPTERS.kling!, http, req({ model: "kling-4.0", duration: 8, ratio: "21:9" }), fast);
    expect(result).toEqual({ url: "https://cdn.kling/v.mp4" });
    expect(calls[0]!.url).toBe(`${base}/text-to-video/kling-4.0`);
    expect(calls[0]!.headers.authorization).toBe(`Bearer ${KEY}`);
    expect(calls[0]!.body).toMatchObject({ prompt: "雨夜里的灯笼", settings: { aspect_ratio: "21:9", duration: 8, resolution: "720p" } });
  });

  it("image-to-video: first_frame carries raw base64 (no data: prefix)", async () => {
    const { http, calls } = fakeHttp(base, routes);
    await runVideoJob(VIDEO_JOB_ADAPTERS.kling!, http, req({ model: "kling-3.0", image: PNG }), fast);
    expect(calls[0]!.url).toBe(`${base}/image-to-video/kling-3.0`);
    const contents = calls[0]!.body!.contents as Array<Record<string, unknown>>;
    expect(contents).toContainEqual({ type: "first_frame", url: "iVBORw0KGgo=" });
  });

  it("maps business codes to Chinese and never echoes the key", async () => {
    const { http } = fakeHttp(base, () => ({ status: 401, body: { code: 1001, message: `bad key ${KEY.slice(0, 4)}` } }));
    const error = await runVideoJob(VIDEO_JOB_ADAPTERS.kling!, http, req(), fast).catch((e: Error) => e);
    expect(error).toBeInstanceOf(VideoJobError);
    expect((error as Error).message).toMatch(/可灵/);
    expect((error as Error).message).not.toContain(KEY);
  });
});

describe("Vidu", () => {
  it("uses Token auth, text2video / img2video and creations[0].url", async () => {
    const { http, calls } = fakeHttp("https://api.vidu.cn", (call) => {
      if (call.method === "POST") return { body: { task_id: "v1", state: "created" } };
      if (call.url.endsWith("/ent/v2/tasks/v1/creations")) return { body: { state: "success", creations: [{ url: "https://cdn.vidu/v.mp4" }] } };
      return undefined;
    });
    await runVideoJob(VIDEO_JOB_ADAPTERS.vidu!, http, req({ model: "viduq3-pro", ratio: "4:3" }), fast);
    expect(calls[0]!.url).toBe("https://api.vidu.cn/ent/v2/text2video");
    expect(calls[0]!.headers.authorization).toBe(`Token ${KEY}`);
    expect(calls[0]!.body).toMatchObject({ model: "viduq3-pro", aspect_ratio: "4:3", duration: 5 });
    await runVideoJob(VIDEO_JOB_ADAPTERS.vidu!, http, req({ model: "viduq3-pro", image: PNG }), fast);
    const i2v = calls.find((c) => c.url.endsWith("/img2video"))!;
    expect(i2v.body).toMatchObject({ images: [PNG] });
    expect(i2v.body!.aspect_ratio).toBeUndefined();
  });

  it("surfaces a failed state", async () => {
    const { http } = fakeHttp("https://api.vidu.cn", (call) =>
      call.method === "POST" ? { body: { task_id: "v1" } } : { body: { state: "failed", err_code: "AuditFailed" } },
    );
    await expect(runVideoJob(VIDEO_JOB_ADAPTERS.vidu!, http, req(), fast)).rejects.toThrow(/Vidu.*AuditFailed/);
  });
});

describe("Zhipu CogVideoX", () => {
  it("posts videos/generations and reads async-result video_result", async () => {
    const base = "https://open.bigmodel.cn/api/paas/v4";
    const { http, calls } = fakeHttp(base, (call) => {
      if (call.method === "POST") return { body: { id: "z1", task_status: "PROCESSING" } };
      if (call.url === `${base}/async-result/z1`) return { body: { task_status: "SUCCESS", video_result: [{ url: "https://cdn.z/v.mp4" }] } };
      return undefined;
    });
    const result = await runVideoJob(VIDEO_JOB_ADAPTERS.zhipu!, http, req({ model: "cogvideox-3", prompt: "长".repeat(600), ratio: "9:16" }), fast);
    expect(result).toEqual({ url: "https://cdn.z/v.mp4" });
    expect(calls[0]!.url).toBe(`${base}/videos/generations`);
    expect((calls[0]!.body!.prompt as string).length).toBe(512);
    expect(calls[0]!.body).toMatchObject({ size: "1080x1920", duration: 5 });
  });
});

describe("MiniMax", () => {
  const base = "https://api.minimaxi.com/v1";
  it("submits, polls, then trades file_id for download_url", async () => {
    let polls = 0;
    const { http, calls } = fakeHttp(base, (call) => {
      if (call.method === "POST") return { body: { task_id: "m1", base_resp: { status_code: 0, status_msg: "success" } } };
      if (call.url.includes("query/video_generation?task_id=m1"))
        return { body: polls++ < 1 ? { status: "Processing" } : { status: "Success", file_id: "f9", base_resp: { status_code: 0 } } };
      if (call.url.includes("files/retrieve?file_id=f9")) return { body: { file: { download_url: "https://cdn.mm/v.mp4" }, base_resp: { status_code: 0 } } };
      return undefined;
    });
    const result = await runVideoJob(VIDEO_JOB_ADAPTERS.minimax!, http, req({ model: "MiniMax-Hailuo-2.3", image: PNG, duration: 10 }), fast);
    expect(result).toEqual({ url: "https://cdn.mm/v.mp4" });
    expect(calls[0]!.url).toBe(`${base}/video_generation`);
    expect(calls[0]!.body).toMatchObject({ model: "MiniMax-Hailuo-2.3", first_frame_image: PNG, duration: 10 });
    expect(calls[0]!.body!.aspect_ratio).toBeUndefined();
  });

  it("treats base_resp errors inside HTTP 200 as failures", async () => {
    const { http } = fakeHttp(base, () => ({ body: { base_resp: { status_code: 1008, status_msg: "insufficient balance" } } }));
    await expect(runVideoJob(VIDEO_JOB_ADAPTERS.minimax!, http, req(), fast)).rejects.toThrow(/MiniMax提交任务失败（余额不足）/);
  });
});

describe("通义万相 (DashScope)", () => {
  const base = "https://dashscope.aliyuncs.com/api/v1";
  const routes = (call: Call): Reply | undefined => {
    if (call.method === "POST") return { body: { output: { task_id: "w1", task_status: "PENDING" } } };
    if (call.url === `${base}/tasks/w1`) return { body: { output: { task_status: "SUCCEEDED", video_url: "https://oss/v.mp4" } } };
    return undefined;
  };

  it("wan2.7 t2v: async header, resolution + ratio", async () => {
    const { http, calls } = fakeHttp(base, routes);
    await runVideoJob(VIDEO_JOB_ADAPTERS.dashscope!, http, req({ model: "wan2.7-t2v", duration: 12, ratio: "3:4" }), fast);
    expect(calls[0]!.url).toBe(`${base}/services/aigc/video-generation/video-synthesis`);
    expect(calls[0]!.headers["x-dashscope-async"]).toBe("enable");
    expect(calls[0]!.body).toEqual({
      model: "wan2.7-t2v",
      input: { prompt: "雨夜里的灯笼" },
      parameters: { duration: 12, resolution: "720P", ratio: "3:4" },
    });
  });

  it("wan2.7 i2v swaps to the -i2v model and uses media first_frame", async () => {
    const { http, calls } = fakeHttp(base, routes);
    await runVideoJob(VIDEO_JOB_ADAPTERS.dashscope!, http, req({ model: "wan2.7-t2v", image: PNG }), fast);
    expect(calls[0]!.body).toMatchObject({ model: "wan2.7-i2v", input: { media: [{ type: "first_frame", url: PNG }] } });
  });

  it("legacy models use size / img_url and drop fixed durations", async () => {
    const { http, calls } = fakeHttp(base, routes);
    await runVideoJob(VIDEO_JOB_ADAPTERS.dashscope!, http, req({ model: "wan2.6-t2v", ratio: "9:16" }), fast);
    expect(calls[0]!.body!.parameters).toEqual({ duration: 5, size: "720*1280" });
    await runVideoJob(VIDEO_JOB_ADAPTERS.dashscope!, http, req({ model: "wan2.2-t2v-plus", image: PNG }), fast);
    expect(calls[2]!.body).toMatchObject({ model: "wan2.2-i2v-plus", input: { img_url: PNG }, parameters: { resolution: "1080P" } });
    expect((calls[2]!.body!.parameters as Record<string, unknown>).duration).toBeUndefined();
  });

  it("reports FAILED with the vendor code", async () => {
    const { http } = fakeHttp(base, (call) =>
      call.method === "POST" ? routes(call) : { body: { output: { task_status: "FAILED", code: "DataInspectionFailed", message: "blocked" } } },
    );
    await expect(runVideoJob(VIDEO_JOB_ADAPTERS.dashscope!, http, req({ model: "wan2.7-t2v" }), fast)).rejects.toThrow(
      "通义万相任务失败：DataInspectionFailed blocked",
    );
  });
});

describe("Veo (Vertex)", () => {
  const base = "https://aiplatform.googleapis.com/v1";
  const model = "veo-3.1-generate-001";
  const routes = (call: Call): Reply | undefined => {
    if (call.url.endsWith(":predictLongRunning")) return { body: { name: "projects/p/operations/op1" } };
    if (call.url.endsWith(":fetchPredictOperation"))
      return { body: { done: true, response: { videos: [{ bytesBase64Encoded: Buffer.from("MP4").toString("base64"), mimeType: "video/mp4" }] } } };
    return undefined;
  };

  it("predictLongRunning with inline image, fetchPredictOperation returns bytes", async () => {
    const { http, calls } = fakeHttp(base, routes);
    const result = await runVideoJob(VIDEO_JOB_ADAPTERS.veo!, http, req({ model, image: PNG, duration: 8, ratio: "1:1" }), fast);
    expect("bytes" in result && result.bytes.toString()).toBe("MP4");
    expect(calls[0]!.url).toBe(`${base}/publishers/google/models/${model}:predictLongRunning`);
    expect(calls[0]!.headers["x-goog-api-key"]).toBe(KEY);
    expect(calls[0]!.body).toEqual({
      instances: [{ prompt: "雨夜里的灯笼", image: { bytesBase64Encoded: "iVBORw0KGgo=", mimeType: "image/png" } }],
      parameters: { sampleCount: 1, durationSeconds: 8, aspectRatio: "16:9" },
    });
    expect(calls[1]!.body).toEqual({ operationName: "projects/p/operations/op1" });
  });

  it("uses Bearer for OAuth access tokens and rejects remote images", async () => {
    const { http, calls } = fakeHttp(base, routes);
    await runVideoJob(VIDEO_JOB_ADAPTERS.veo!, { ...http, apiKey: "ya29.token" }, req({ model }), fast);
    expect(calls[0]!.headers.authorization).toBe("Bearer ya29.token");
    expect(calls[0]!.headers["x-goog-api-key"]).toBeUndefined();
    await expect(runVideoJob(VIDEO_JOB_ADAPTERS.veo!, http, req({ model, image: "https://x/a.png" }), fast)).rejects.toThrow(/只接受内联图片/);
  });

  it("explains safety filtering", async () => {
    const { http } = fakeHttp(base, (call) =>
      call.url.endsWith(":fetchPredictOperation") ? { body: { done: true, response: { raiMediaFilteredCount: 1 } } } : routes(call),
    );
    await expect(runVideoJob(VIDEO_JOB_ADAPTERS.veo!, http, req({ model }), fast)).rejects.toThrow("Google Veo结果被安全策略过滤");
  });
});

describe("runVideoJob", () => {
  const adapter = VIDEO_JOB_ADAPTERS.vidu!;
  it("times out with a Chinese message", async () => {
    let t = 0;
    const { http } = fakeHttp("https://api.vidu.cn", (call) => (call.method === "POST" ? { body: { task_id: "v1" } } : { body: { state: "queueing" } }));
    await expect(
      runVideoJob(adapter, http, req(), { ...fast, maxWaitMs: 60_000, now: () => (t += 20_000) }),
    ).rejects.toThrow("Vidu视频生成超时（1 分钟内没有完成）");
  });

  it("retries transient poll failures with backoff, then succeeds", async () => {
    let polls = 0;
    const waits: number[] = [];
    const { http } = fakeHttp("https://api.vidu.cn", (call) => {
      if (call.method === "POST") return { body: { task_id: "v1" } };
      polls += 1;
      return polls < 3 ? { status: 503, body: { message: "busy" } } : { body: { state: "success", creations: [{ url: "https://cdn/v.mp4" }] } };
    });
    await runVideoJob(adapter, http, req(), { ...fast, pollMs: 10, wait: async (ms) => void waits.push(ms) });
    expect(waits).toEqual([10, 20, 40]);
  });

  it("gives up after 5 transient failures and does not retry auth errors", async () => {
    let polls = 0;
    const flaky = fakeHttp("https://api.vidu.cn", (call) => (call.method === "POST" ? { body: { task_id: "v1" } } : (polls++, { status: 502, body: {} })));
    await expect(runVideoJob(adapter, flaky.http, req(), fast)).rejects.toThrow(/服务端暂时不可用/);
    expect(polls).toBe(5);
    let authPolls = 0;
    const denied = fakeHttp("https://api.vidu.cn", (call) => (call.method === "POST" ? { body: { task_id: "v1" } } : (authPolls++, { status: 401, body: {} })));
    await expect(runVideoJob(adapter, denied.http, req(), fast)).rejects.toThrow(/API Key 无效/);
    expect(authPolls).toBe(1);
  });

  it("stops polling when cancelled", async () => {
    let aborted = false;
    const { http, calls } = fakeHttp("https://api.vidu.cn", (call) => (call.method === "POST" ? { body: { task_id: "v1" } } : { body: { state: "processing" } }));
    const cancel = runVideoJob(adapter, http, req(), {
      ...fast,
      wait: async () => {
        aborted = true;
      },
      throwIfAborted: () => {
        if (aborted) throw new Error("cancelled");
      },
      isAborted: () => aborted,
    });
    await expect(cancel).rejects.toThrow("cancelled");
    expect(calls).toHaveLength(1);
  });
});
