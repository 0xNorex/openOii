/**
 * 服务商原生视频接口的统一形状：submit → poll → 拿到结果（URL 或字节）。
 * 每个服务商一个小模块，只负责请求 / 响应的形状；重试、轮询节奏、超时、
 * 取消和下载都在 runner 与 MediaService 里统一处理。密钥只进请求头，
 * 绝不出现在错误信息或日志里。
 */

export interface VideoJobRequest {
  model: string;
  prompt: string;
  /** data:image/...;base64 或 http(s) URL；null 表示文生视频 */
  image: string | null;
  /** 已按服务商规则取整后的秒数 */
  duration: number;
  /** 用户配置的画幅（16:9 等），服务商不支持时由模块自己回落 */
  ratio: string;
  /** 反向提示词：有原生字段的服务商单独发送（万相、Veo），其它只靠正向提示词里的 Avoid 段 */
  negativePrompt?: string;
}

export interface VideoJobHttp {
  baseUrl: string;
  apiKey: string;
  /** 提交：带重试（408/429/5xx）与幂等头 */
  post(url: string, init: RequestInit): Promise<Response>;
  /** 查询：单次请求（默认 GET），可被取消 */
  request(url: string, init?: RequestInit): Promise<Response>;
}

export type VideoJobResult =
  | { url: string }
  | { bytes: Buffer };

export type VideoJobState =
  | { state: "pending" }
  | { state: "done"; result: VideoJobResult }
  | { state: "failed"; message: string };

export type DurationRule = { min: number; max: number } | number[];

export interface VideoJobAdapter {
  /** VIDEO_PROVIDER 的值 */
  id: string;
  /** 中文名，出现在错误信息里 */
  label: string;
  durations(model: string): DurationRule;
  submit(http: VideoJobHttp, request: VideoJobRequest): Promise<string>;
  poll(http: VideoJobHttp, taskId: string, request: VideoJobRequest): Promise<VideoJobState>;
}
