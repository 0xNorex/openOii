/**
 * Media services: image / video / TTS.
 *
 * Provider identity/model/endpoint is pinned by RunContextSnapshot. Secrets are
 * resolved by credential key at execution time so rotation does not rewrite a
 * historical run snapshot. External create requests carry the durable stage
 * idempotency key when the provider accepts arbitrary HTTP headers.
 */
import { execFile } from "node:child_process";
import { lookup } from "node:dns/promises";
import { createHash, randomUUID } from "node:crypto";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";
import {
  copyFileSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  linkSync,
  unlinkSync,
  rmSync,
  createWriteStream,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import type { EngineDatabase } from "../db.js";
import {
  AiOperationError,
  assertOperationInFlight,
  operationHeaders,
  type AiOperation,
  withAiActivity,
} from "../ai-operation.js";
import { operationSpanAttributes, withProviderSpan } from "../observability.js";

const execFileAsync = promisify(execFile);

export interface MediaSettings {
  imageProvider: "fake" | "modelscope" | "openai";
  imageBaseUrl: string;
  imageApiKey: string | null;
  imageModel: string;
  imageEndpoint: string;
  enableImageToImage: boolean;
  fakeImageFixtureUrl: string | null;

  videoProvider: "fake" | "openai" | "doubao";
  videoBaseUrl: string;
  videoApiKey: string | null;
  videoModel: string;
  videoEndpoint: string;
  enableImageToVideo: boolean;
  videoMode: string;
  fakeVideoFixtureUrl: string | null;
  fakeVideoFixturePath: string | null;
  doubaoApiKey: string | null;
  doubaoVideoModel: string;
  doubaoVideoDuration: number;
  doubaoVideoRatio: string;
  videoImageMode: string;
  videoInlineLocalImages: boolean;
  publicBaseUrl: string | null;

  ttsEnabled: boolean;
  bgmEnabled: boolean;
  ttsDefaultVoice: string;
  ttsVolume: number;
  bgmVolume: number;
  bgmDirectory: string;
  textProvider: string;
  staticDir: string;
}

export interface MediaProviderSnapshot {
  provider?: string | null;
  base_url?: string | null;
  model?: string | null;
  endpoint?: string | null;
  enable_image_to_image?: unknown;
  enable_image_to_video?: unknown;
  video_mode?: string | null;
  video_image_mode?: string | null;
  video_inline_local_images?: unknown;
  public_base_url?: string | null;
  duration?: unknown;
  ratio?: string | null;
  credential_keys?: string[] | null;
}

export interface MediaRunSnapshot {
  text?: MediaProviderSnapshot | null;
  image?: MediaProviderSnapshot | null;
  video?: MediaProviderSnapshot | null;
  policy?: Record<string, unknown> | null;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
  }
  return fallback;
}

function asNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function resolveMediaSettings(
  db: EngineDatabase,
  snapshot?: MediaRunSnapshot | null,
): MediaSettings {
  const staticDir =
    process.env.ENGINE_STATIC_DIR ?? resolve(process.cwd(), "../backend/app/static");
  const pick = (key: string, env: string, fallback: string): string =>
    db.configValue(key, env, fallback) ?? fallback;
  const optional = (key: string, env: string): string | null => {
    const value = db.configValue(key, env);
    return value ? value : null;
  };
  const secret = (keys: string[] | null | undefined): string | null => {
    for (const key of keys ?? []) {
      const value = db.configValue(key, key);
      if (value) return value;
    }
    return null;
  };

  const imageSnapshot = snapshot?.image ?? null;
  const videoSnapshot = snapshot?.video ?? null;
  const textSnapshot = snapshot?.text ?? null;
  const policy = snapshot?.policy ?? null;

  const imageProviderRaw =
    imageSnapshot?.provider ?? pick("IMAGE_PROVIDER", "IMAGE_PROVIDER", "fake");
  const imageProvider: MediaSettings["imageProvider"] =
    imageProviderRaw === "modelscope" || imageProviderRaw === "openai"
      ? imageProviderRaw
      : "fake";
  const videoProviderRaw =
    videoSnapshot?.provider ?? pick("VIDEO_PROVIDER", "VIDEO_PROVIDER", "fake");
  const videoMode = videoSnapshot
    ? String(videoSnapshot.video_mode ?? "text")
    : pick("VIDEO_MODE", "VIDEO_MODE", "text");
  const enableImageToVideo = (videoSnapshot
    ? asBoolean(videoSnapshot.enable_image_to_video, false)
    : pick("ENABLE_IMAGE_TO_VIDEO", "ENABLE_IMAGE_TO_VIDEO", "false") === "true") || videoMode === "image";
  const videoProvider: MediaSettings["videoProvider"] =
    videoProviderRaw === "openai" || videoProviderRaw === "doubao"
      ? videoProviderRaw
      : "fake";
  const textProvider = String(
    textSnapshot?.provider ?? pick("TEXT_PROVIDER", "TEXT_PROVIDER", "anthropic"),
  );

  const imageBaseUrl = imageSnapshot
    ? String(imageSnapshot.base_url ?? "")
    : pick("IMAGE_BASE_URL", "IMAGE_BASE_URL", "https://api-inference.modelscope.cn");
  const videoBaseUrl = videoSnapshot
    ? String(videoSnapshot.base_url ?? "")
    : pick("VIDEO_BASE_URL", "VIDEO_BASE_URL", "https://api.example.com/v1");
  if (imageSnapshot && imageProvider !== "fake" && !imageBaseUrl) {
    throw new Error(`pinned image provider ${imageProvider} has no base_url`);
  }
  if (
    videoSnapshot &&
    videoProvider !== "fake" &&
    videoProvider !== "doubao" &&
    !videoBaseUrl
  ) {
    throw new Error(`pinned video provider ${videoProvider} has no base_url`);
  }

  const defaultImageCredentialKeys = imageProvider === "fake" ? [] : ["IMAGE_API_KEY"];
  const defaultVideoCredentialKeys =
    videoProvider === "fake"
      ? []
      : videoProvider === "doubao"
        ? ["DOUBAO_API_KEY"]
        : ["VIDEO_API_KEY"];
  const videoSecret = videoSnapshot
    ? secret(videoSnapshot.credential_keys ?? defaultVideoCredentialKeys)
    : null;

  return {
    imageProvider,
    imageBaseUrl,
    imageApiKey: imageSnapshot
      ? secret(imageSnapshot.credential_keys ?? defaultImageCredentialKeys)
      : optional("IMAGE_API_KEY", "IMAGE_API_KEY"),
    imageModel: imageSnapshot
      ? String(imageSnapshot.model ?? (imageProvider === "fake" ? "fake" : ""))
      : pick("IMAGE_MODEL", "IMAGE_MODEL", "Tongyi-MAI/Z-Image-Turbo"),
    imageEndpoint: imageSnapshot
      ? String(imageSnapshot.endpoint ?? "/v1/images/generations")
      : pick("IMAGE_ENDPOINT", "IMAGE_ENDPOINT", "/v1/images/generations"),
    enableImageToImage: imageSnapshot
      ? asBoolean(imageSnapshot.enable_image_to_image, true)
      : pick("ENABLE_IMAGE_TO_IMAGE", "ENABLE_IMAGE_TO_IMAGE", "true") === "true",
    fakeImageFixtureUrl: optional("FAKE_IMAGE_FIXTURE_URL", "FAKE_IMAGE_FIXTURE_URL"),

    videoProvider,
    videoBaseUrl,
    videoApiKey:
      videoProvider === "openai"
        ? videoSnapshot
          ? videoSecret
          : optional("VIDEO_API_KEY", "VIDEO_API_KEY")
        : null,
    videoModel: videoSnapshot
      ? String(videoSnapshot.model ?? (videoProvider === "fake" ? "fake" : ""))
      : pick("VIDEO_MODEL", "VIDEO_MODEL", "video-gen-1"),
    videoEndpoint: videoSnapshot
      ? String(videoSnapshot.endpoint ?? "/videos/generations")
      : pick("VIDEO_ENDPOINT", "VIDEO_ENDPOINT", "/videos/generations"),
    enableImageToVideo,
    videoMode,
    videoImageMode: videoSnapshot && "video_image_mode" in videoSnapshot
      ? String(videoSnapshot.video_image_mode ?? "first_frame")
      : pick("VIDEO_IMAGE_MODE", "VIDEO_IMAGE_MODE", "first_frame"),
    videoInlineLocalImages: videoSnapshot && "video_inline_local_images" in videoSnapshot
      ? asBoolean(videoSnapshot.video_inline_local_images, true)
      : pick("VIDEO_INLINE_LOCAL_IMAGES", "VIDEO_INLINE_LOCAL_IMAGES", "true") === "true",
    publicBaseUrl: videoSnapshot && "public_base_url" in videoSnapshot
      ? videoSnapshot.public_base_url ?? null
      : optional("PUBLIC_BASE_URL", "PUBLIC_BASE_URL"),
    fakeVideoFixtureUrl: optional("FAKE_VIDEO_FIXTURE_URL", "FAKE_VIDEO_FIXTURE_URL"),
    fakeVideoFixturePath: optional("FAKE_VIDEO_FIXTURE_PATH", "FAKE_VIDEO_FIXTURE_PATH"),
    doubaoApiKey:
      videoProvider === "doubao"
        ? videoSnapshot
          ? videoSecret
          : optional("DOUBAO_API_KEY", "DOUBAO_API_KEY")
        : null,
    doubaoVideoModel: videoSnapshot
      ? String(videoSnapshot.model ?? "doubao-seedance-1-5-pro-251215")
      : pick(
          "DOUBAO_VIDEO_MODEL",
          "DOUBAO_VIDEO_MODEL",
          "doubao-seedance-1-5-pro-251215",
        ),
    doubaoVideoDuration: videoSnapshot
      ? asNumber(videoSnapshot.duration, 5)
      : Number(pick("DOUBAO_VIDEO_DURATION", "DOUBAO_VIDEO_DURATION", "5")),
    doubaoVideoRatio: videoSnapshot
      ? String(videoSnapshot.ratio ?? "adaptive")
      : pick("DOUBAO_VIDEO_RATIO", "DOUBAO_VIDEO_RATIO", "adaptive"),

    ttsEnabled: policy
      ? asBoolean(policy.tts_enabled, true)
      : pick("TTS_ENABLED", "TTS_ENABLED", "true") === "true",
    bgmEnabled: policy
      ? asBoolean(policy.bgm_enabled, true)
      : pick("BGM_ENABLED", "BGM_ENABLED", "true") === "true",
    ttsDefaultVoice: policy && "tts_default_voice" in policy
      ? String(policy.tts_default_voice ?? "zh-CN-XiaoxiaoNeural")
      : pick("TTS_DEFAULT_VOICE", "TTS_DEFAULT_VOICE", "zh-CN-XiaoxiaoNeural"),
    ttsVolume: policy && "tts_volume" in policy
      ? asNumber(policy.tts_volume, 1)
      : asNumber(pick("TTS_VOLUME", "TTS_VOLUME", "1"), 1),
    bgmVolume: policy && "bgm_volume" in policy
      ? asNumber(policy.bgm_volume, 0.3)
      : asNumber(pick("BGM_VOLUME", "BGM_VOLUME", "0.3"), 0.3),
    bgmDirectory: policy && "bgm_directory" in policy
      ? String(policy.bgm_directory ?? "static/bgm")
      : pick("BGM_DIRECTORY", "BGM_DIRECTORY", "static/bgm"),
    textProvider,
    staticDir,
  };
}

function safeSlug(prompt: string, fallback: string): string {
  const cleaned = prompt
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return cleaned || fallback;
}

function placeholderSvg(prompt: string): string {
  const label = prompt.slice(0, 60).replace(/[<>&]/g, "");
  const digest = createHash("sha1").update(prompt).digest("hex").slice(0, 8);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="100%" height="100%" fill="#1e1b4b"/><text x="50%" y="45%" fill="#fbbf24" font-size="36" text-anchor="middle" font-family="sans-serif">Fake Image</text><text x="50%" y="58%" fill="#ffffff" font-size="20" text-anchor="middle" font-family="sans-serif">${label}</text><text x="50%" y="68%" fill="#94a3b8" font-size="14" text-anchor="middle" font-family="sans-serif">Prompt ${digest}</text></svg>`;
}

const FAKE_VIDEO_COLORS = [
  "0x111827",
  "0x1e1b4b",
  "0x422006",
  "0x052e16",
  "0x3b0764",
  "0x0f172a",
];

function promptLabel(prompt: string): string {
  const compact = prompt.replace(/\s+/g, " ").trim();
  const ascii = compact.replace(/[^\x20-\x7E]/g, "").trim();
  if (ascii.length >= 3) return ascii.slice(0, 36);
  const digest = createHash("sha1").update(prompt).digest("hex").slice(0, 8);
  return `local prompt ${digest}`;
}

export class MediaService {
  private idempotencyKey: string | null = null;
  private abortSignal: AbortSignal | null = null;
  private registerMedia: ((relativePath: string) => void) | null = null;
  /**
   * Current operation identity, when the caller supplied one.
   *
   * Provider requests get their idempotency header and cancellation from this
   * single object instead of from separate fields, matching the contract text
   * operations already use (`ai-operation.ts`).
   */
  private operation: AiOperation | null = null;

  constructor(private readonly settings: MediaSettings) {}

  /** Bind the operation the following media requests belong to. */
  /**
   * Bind the operation the following media requests belong to. Its idempotency
   * key and deadline apply to every provider call until it is cleared, so
   * identity and cancellation come from one object (see `ai-operation.ts`).
   */
  setOperation(operation: AiOperation | null): void {
    this.operation = operation;
    this.idempotencyKey = operation?.idempotencyKey ?? null;
  }

  /**
   * Bind the run's cancellation signal. Every provider request and every
   * in-process wait then observes it, so cancel stops the work instead of
   * merely marking the run cancelled while the request keeps running.
   */
  setAbortSignal(signal: AbortSignal | null): void {
    this.abortSignal = signal;
  }

  setMediaRegistrar(register: (relativePath: string) => void): void {
    this.registerMedia = register;
  }

  private managedMediaDirectory(): string {
    mkdirSync(this.settings.staticDir, { recursive: true });
    const root = realpathSync(this.settings.staticDir);
    const dir = join(root, "managed-v1");
    try {
      mkdirSync(dir);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    if (lstatSync(dir).isSymbolicLink() || realpathSync(dir) !== dir) {
      throw new Error("managed media directory must be a real directory inside static storage");
    }
    return dir;
  }

  private publishManagedFile(source: string, extension: string): string {
    if (!this.registerMedia) throw new Error("managed media registration requires an execution fence");
    const dir = this.managedMediaDirectory();
    const filename = `${randomUUID()}${extension}`;
    const relativePath = `managed-v1/${filename}`;
    const destination = join(dir, filename);
    linkSync(source, destination);
    try {
      this.registerMedia(relativePath);
      return `/static/${relativePath}`;
    } catch (error) {
      unlinkSync(destination);
      throw error;
    }
  }

  private writeManagedFile(contents: string, extension: string): string {
    if (!this.registerMedia) throw new Error("managed media registration requires an execution fence");
    const dir = this.managedMediaDirectory();
    const filename = `${randomUUID()}${extension}`;
    const relativePath = `managed-v1/${filename}`;
    const destination = join(dir, filename);
    writeFileSync(destination, contents, { encoding: "utf8", flag: "wx" });
    try {
      this.registerMedia(relativePath);
      return `/static/${relativePath}`;
    } catch (error) {
      unlinkSync(destination);
      throw error;
    }
  }

  /** Reject if the run was cancelled, before starting more provider work. */
  private throwIfAborted(): void {
    if (this.operation) {
      assertOperationInFlight(this.operation);
      return;
    }
    if (this.abortSignal?.aborted) {
      throw new AiOperationError("aborted", "media", "run cancelled: provider request aborted");
    }
  }

  private requestInit(init: RequestInit = {}): RequestInit {
    return this.abortSignal ? { ...init, signal: this.abortSignal } : init;
  }

  /** Cancellable wait: a pending backoff or poll must not outlive the run. */
  private async wait(ms: number): Promise<void> {
    const signal = this.abortSignal;
    if (!signal) {
      await sleep(ms);
      return;
    }
    if (signal.aborted) {
      throw new AiOperationError("aborted", "media", "run cancelled: provider request aborted");
    }
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      const onAbort = (): void => {
        clearTimeout(timer);
        reject(
          new AiOperationError("aborted", "media", "run cancelled: provider request aborted"),
        );
      };
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }

  /** GenAI span attributes for a media provider request. */
  private providerSpanAttributes(kind: "image" | "video", system: string, model: string) {
    const identity = this.operation ? operationSpanAttributes(this.operation) : {};
    return {
      ...identity,
      "gen_ai.system": system,
      "gen_ai.operation.name": kind === "image" ? "image_generation" : "video_generation",
      "gen_ai.request.model": model,
    };
  }

  private idempotencyHeaders(): Record<string, string> {
    // One header contract for every provider that accepts operation identity.
    if (this.operation) return operationHeaders(this.operation);
    return this.idempotencyKey ? { "Idempotency-Key": this.idempotencyKey } : {};
  }

  get staticDir(): string {
    return this.settings.staticDir;
  }

  get audioEnabled(): boolean {
    return this.settings.ttsEnabled || this.settings.bgmEnabled;
  }

  async readImageBytes(url: string): Promise<Buffer> {
    this.throwIfAborted();
    if (url.startsWith("/static/")) {
      const root = realpathSync(this.settings.staticDir);
      const path = realpathSync(resolve(root, url.slice("/static/".length)));
      if (!path.startsWith(`${root}${sep}`)) throw new Error("image path is outside static storage");
      return readFileSync(path);
    }
    if (url.startsWith("data:image/")) {
      const comma = url.indexOf(",");
      if (comma < 0 || !url.slice(0, comma).endsWith(";base64")) {
        throw new Error("unsupported image data URL");
      }
      return Buffer.from(url.slice(comma + 1), "base64");
    }
    if (!/^https?:\/\//i.test(url)) throw new Error("unsupported image URL");
    const timeout = AbortSignal.timeout(30_000);
    const signal = this.abortSignal ? AbortSignal.any([this.abortSignal, timeout]) : timeout;
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`image download failed: ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }

  saveImageBytes(image: Buffer, prefix: string): string {
    const dir = join(this.settings.staticDir, "images");
    mkdirSync(dir, { recursive: true });
    const digest = createHash("sha1").update(image).digest("hex").slice(0, 12);
    const filename = `${safeSlug(prefix, "reference")}_${digest}.png`;
    const path = join(dir, filename);
    if (!existsSync(path)) writeFileSync(path, image);
    return `/static/images/${filename}`;
  }

  async generateImageUrl(args: {
    prompt: string;
    size?: string;
    imageBytes?: Buffer | null;
  }): Promise<string> {
    // One provider span per image request, nested under its stage span.
    return withAiActivity(this.operation ?? undefined, "图像生成", () =>
      withProviderSpan(
        "gen_ai.image.generate",
        this.providerSpanAttributes("image", this.settings.imageProvider, this.settings.imageModel),
        () => this.generateImageUrlInner(args),
      ),
    );
  }

  private async generateImageUrlInner(args: {
    prompt: string;
    size?: string;
    imageBytes?: Buffer | null;
  }): Promise<string> {
    const { prompt } = args;
    if (this.settings.fakeImageFixtureUrl) return this.settings.fakeImageFixtureUrl;

    if (this.settings.imageProvider === "fake") {
      return this.writeManagedFile(placeholderSvg(prompt), ".svg");
    }

    if (!this.settings.imageApiKey) throw new Error("IMAGE_API_KEY is required");
    this.throwIfAborted();
    const endpoint = new URL(this.settings.imageEndpoint, this.settings.imageBaseUrl).toString();
    const payload: Record<string, unknown> = {
      model: this.settings.imageModel,
      prompt,
      size: args.size ?? "1024x1024",
    };
    if (args.imageBytes && this.settings.enableImageToImage) {
      payload.image = `data:image/png;base64,${args.imageBytes.toString("base64")}`;
    }
    const response = await fetch(
      endpoint,
      this.requestInit({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.settings.imageApiKey}`,
          ...this.idempotencyHeaders(),
        },
        body: JSON.stringify(payload),
      }),
    );
    if (!response.ok) throw new Error(`image provider failed: ${response.status}`);
    const body = (await response.json()) as Record<string, unknown>;
    const data = Array.isArray(body.data) ? body.data[0] : null;
    const url = data && typeof data === "object" ? (data as Record<string, unknown>).url : null;
    if (typeof url !== "string" || !url) throw new Error("image provider returned no URL");
    return url;
  }

  async generateVideoUrl(args: {
    prompt: string;
    imageUrl?: string | null;
    duration?: number;
  }): Promise<string> {
    return withAiActivity(this.operation ?? undefined, "视频生成", () =>
      withProviderSpan(
        "gen_ai.video.generate",
        this.providerSpanAttributes("video", this.settings.videoProvider, this.settings.videoModel),
        () => this.generateVideoUrlInner(args),
      ),
    );
  }

  private async generateVideoUrlInner(args: {
    prompt: string;
    imageUrl?: string | null;
    duration?: number;
  }): Promise<string> {
    const { prompt } = args;
    if (this.settings.fakeVideoFixtureUrl) return this.settings.fakeVideoFixtureUrl;

    if (this.settings.videoProvider === "fake") {
      if (this.settings.fakeVideoFixturePath) {
        const source = resolve(this.settings.fakeVideoFixturePath);
        if (!existsSync(source)) {
          throw new Error(`Fake video fixture file not found: ${source}`);
        }
        return this.publishManagedFile(source, ".mp4");
      }
      return this.ensureDefaultFakeClip(prompt, args.duration);
    }

    if (this.settings.videoProvider === "doubao") {
      if (!this.settings.doubaoApiKey) throw new Error("DOUBAO_API_KEY is required");
      this.throwIfAborted();
      const payload: Record<string, unknown> = {
        model: this.settings.doubaoVideoModel,
        content: [{ type: "text", text: prompt }],
        duration: args.duration ?? this.settings.doubaoVideoDuration,
        ratio: this.settings.doubaoVideoRatio,
      };
      if (args.imageUrl && this.settings.enableImageToVideo) {
        const imageUrl = await this.videoImageUrl(args.imageUrl);
        (payload.content as unknown[]).push({
          type: "image_url",
          image_url: { url: imageUrl },
        });
      }
      const createResponse = await fetch(
        "https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks",
        this.requestInit({
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.settings.doubaoApiKey}`,
            ...this.idempotencyHeaders(),
          },
          body: JSON.stringify(payload),
        }),
      );
      if (!createResponse.ok) {
        throw new Error(`doubao create failed: ${createResponse.status}`);
      }
      const created = (await createResponse.json()) as Record<string, unknown>;
      const taskId = String(created.id ?? "");
      if (!taskId) throw new Error("doubao returned no task id");
      for (let attempt = 0; attempt < 120; attempt += 1) {
        await this.wait(2000);
        const poll = await fetch(
          `https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/${taskId}`,
          this.requestInit({
            headers: { Authorization: `Bearer ${this.settings.doubaoApiKey}` },
          }),
        );
        if (!poll.ok) throw new Error(`doubao poll failed: ${poll.status}`);
        const state = (await poll.json()) as Record<string, unknown>;
        const status = String(state.status ?? "");
        if (status === "succeeded") {
          const content = state.content as Record<string, unknown> | undefined;
          const videoUrl =
            content && typeof content.video_url === "string" ? content.video_url : null;
          if (!videoUrl) throw new Error("doubao returned no video URL");
          return videoUrl;
        }
        if (["failed", "cancelled"].includes(status)) {
          throw new Error(`doubao task ${status}: ${String(state.error ?? "unknown")}`);
        }
      }
      throw new Error("doubao video generation timed out");
    }

    if (!this.settings.videoApiKey) throw new Error("VIDEO_API_KEY is required");
    this.throwIfAborted();
    const endpoint = new URL(this.settings.videoEndpoint, this.settings.videoBaseUrl).toString();
    const payload: Record<string, unknown> = {
      model: this.settings.videoModel,
      prompt,
      duration: args.duration,
    };
    if (args.imageUrl && this.settings.enableImageToVideo) {
      payload.image_url = await this.videoImageUrl(args.imageUrl);
    }
    const response = await fetch(
      endpoint,
      this.requestInit({
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.settings.videoApiKey}`,
          ...this.idempotencyHeaders(),
        },
        body: JSON.stringify(payload),
      }),
    );
    if (!response.ok) throw new Error(`video provider failed: ${response.status}`);
    const body = (await response.json()) as Record<string, unknown>;
    const directUrl = typeof body.url === "string" ? body.url : null;
    const data = Array.isArray(body.data) ? body.data[0] : null;
    const nestedUrl =
      data && typeof data === "object" ? (data as Record<string, unknown>).url : null;
    const url = directUrl ?? (typeof nestedUrl === "string" ? nestedUrl : null);
    if (!url) throw new Error("video provider returned no URL");
    return url;
  }

  private async videoImageUrl(url: string): Promise<string> {
    if (url.startsWith("data:image/")) return url;
    if (!url.startsWith("/static/")) return url;
    if (this.settings.videoInlineLocalImages) {
      return `data:image/png;base64,${(await this.readImageBytes(url)).toString("base64")}`;
    }
    return this.settings.publicBaseUrl
      ? new URL(url, this.settings.publicBaseUrl).toString()
      : url;
  }

  private async ensureDefaultFakeClip(prompt: string, durationArg?: number): Promise<string> {
    if (!this.registerMedia) throw new Error("managed media registration requires an execution fence");
    const tempDir = mkdtempSync(join(this.managedMediaDirectory(), ".fake-video-"));
    const destination = join(tempDir, "output.mp4");

    const digest = parseInt(createHash("sha1").update(prompt).digest("hex").slice(0, 8), 16);
    const color = FAKE_VIDEO_COLORS[digest % FAKE_VIDEO_COLORS.length] ?? "0x111827";
    const label = promptLabel(prompt).replace(/\\/g, "\\\\").replace(/:/g, "\\:");
    const duration = Math.max(1, Math.min(durationArg ?? 2, 10));
    const command = [
      "-y",
      "-f",
      "lavfi",
      "-i",
      `color=c=${color}:s=960x540:d=${duration}`,
      "-f",
      "lavfi",
      "-i",
      "anullsrc=channel_layout=stereo:sample_rate=44100",
      "-vf",
      [
        "drawtext=text='Fake Video':fontcolor=white:fontsize=58:x=(w-text_w)/2:y=150",
        `drawtext=text='${label}':fontcolor=white@0.82:fontsize=24:x=(w-text_w)/2:y=315`,
        "drawtext=text='no external API call':fontcolor=white@0.62:fontsize=22:x=(w-text_w)/2:y=370",
      ].join(","),
      "-shortest",
      "-c:v",
      "libx264",
      "-t",
      String(duration),
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      destination,
    ];
    try {
      try {
        await execFileAsync("ffmpeg", command, { signal: this.abortSignal ?? undefined });
      } catch (error) {
        if (this.abortSignal?.aborted) throw error;
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Fake video provider needs ffmpeg: ${message.slice(0, 300)}`);
      }
      if (this.abortSignal?.aborted) throw new Error("run cancelled");
      return this.publishManagedFile(destination, ".mp4");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  async mergeVideos(videoUrls: string[]): Promise<string> {
    if (videoUrls.length === 0) throw new Error("No video URLs provided");
    const outputDir = join(this.settings.staticDir, "videos");
    mkdirSync(outputDir, { recursive: true });
    const tempDir = mkdtempSync(join(outputDir, ".merge-"));
    const tempOutput = join(tempDir, "output.mp4");
    const downloadDeadline = Date.now() + MAX_DOWNLOAD_MS;
    let downloadedBytes = 0;
    try {
      const localPaths: string[] = [];
      for (let i = 0; i < videoUrls.length; i++) {
        const url = videoUrls[i]!;
        const localPath = this.localPathFor(url);
        if (localPath) {
          if (!existsSync(localPath)) throw new Error("Local video file is missing");
          localPaths.push(localPath);
        } else {
          const dest = join(tempDir, `video_${i}.mp4`);
          downloadedBytes += await downloadPublicVideo(url, dest, downloadDeadline, downloadedBytes, this.abortSignal ?? undefined);
          localPaths.push(dest);
        }
      }
      if (this.abortSignal?.aborted) throw new Error("run cancelled");
      if (localPaths.length === 1) {
        copyFileSync(localPaths[0]!, tempOutput);
      } else {
        const concatFile = join(tempDir, "concat.txt");
        writeFileSync(concatFile, localPaths.map((path) => `file '${path.replaceAll("'", "'\\''")}'`).join("\n") + "\n", "utf8");
        try {
          await execFileAsync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", concatFile, "-c", "copy", tempOutput], { signal: this.abortSignal ?? undefined });
        } catch (error) {
          if (this.abortSignal?.aborted) throw error;
          await execFileAsync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", concatFile, "-c:v", "libx264", "-preset", "fast", "-crf", "23", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", tempOutput], { signal: this.abortSignal ?? undefined });
        }
      }
      if (this.abortSignal?.aborted) throw new Error("run cancelled");
      return this.publishManagedFile(tempOutput, ".mp4");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  }

  localPathFor(url: string): string | null {
    if (!url.startsWith("/static/")) return null;
    const root = realpathSync(this.settings.staticDir);
    const path = resolve(root, url.slice("/static/".length));
    if (path !== root && !path.startsWith(`${root}${sep}`)) throw new Error("Invalid local video path");
    const actual = realpathSync(path);
    if (actual !== root && !actual.startsWith(`${root}${sep}`)) throw new Error("Invalid local video path");
    return actual;
  }
}

const MAX_VIDEO_BYTES = 1024 * 1024 * 1024;
const MAX_VIDEO_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const MAX_DOWNLOAD_MS = 120_000;

function publicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a! >= 224 || (a === 100 && b! >= 64 && b! <= 127) || (a === 169 && b === 254) || (a === 172 && b! >= 16 && b! <= 31) || (a === 192 && (b === 0 || b === 168)) || (a === 198 && (b === 18 || b === 19 || b === 51)) || (a === 203 && b === 0 && c === 113));
  }
  if (isIP(address) !== 6 || address.includes(".")) return false;
  const parts = address.toLowerCase().split("::");
  const left = parts[0] ? parts[0].split(":") : [];
  const right = parts[1] ? parts[1].split(":") : [];
  const words = parts.length === 1 ? left : [...left, ...Array(8 - left.length - right.length).fill("0"), ...right];
  const value = words.reduce((result, word) => (result << 16n) | BigInt(`0x${word || "0"}`), 0n);
  const inRange = (network: bigint, bits: number) => value >> BigInt(128 - bits) === network >> BigInt(128 - bits);
  return inRange(0x2000n << 112n, 3) && !inRange(0x2001n << 112n, 23) && !inRange(0x2001_0db8n << 96n, 32) && !inRange(0x2002n << 112n, 16) && !inRange(0x3fffn << 112n, 20);
}

async function downloadPublicVideo(url: string, destination: string, deadline: number, previouslyDownloaded: number, signal?: AbortSignal): Promise<number> {
  let current = new URL(url);
  for (let redirects = 0; ; redirects++) {
    if ((current.protocol !== "http:" && current.protocol !== "https:") || current.username || current.password) throw new Error("Video URL must be public HTTP or HTTPS");
    let dnsTimeout: ReturnType<typeof setTimeout> | undefined;
    const addresses = await Promise.race([
      lookup(current.hostname, { all: true, verbatim: true }),
      new Promise<never>((_, reject) => {
        dnsTimeout = setTimeout(() => reject(new Error("Video DNS lookup timed out")), Math.max(1, Math.min(10_000, deadline - Date.now())));
      }),
    ]).finally(() => clearTimeout(dnsTimeout));
    if (!addresses.length || addresses.some(({ address }) => !publicAddress(address))) throw new Error("Video URL must resolve only to public IP addresses");
    const pinned = addresses[0]!;
    const response = await new Promise<{ location?: string; bytes: number }>((resolveResponse, reject) => {
      if (signal?.aborted) return reject(new Error("run cancelled"));
      const remaining = deadline - Date.now();
      if (remaining <= 0) return reject(new Error("Video download timed out"));
      const requestFn = current.protocol === "https:" ? httpsRequest : httpRequest;
      const req = requestFn(current, { signal, timeout: remaining, lookup: (_hostname, _options, callback) => callback(null, pinned.address, pinned.family) }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          resolveResponse({ location: res.headers.location, bytes: 0 });
          return;
        }
        if (res.statusCode !== 200) { res.resume(); reject(new Error(`Video server returned HTTP ${res.statusCode ?? 0}`)); return; }
        const declared = Number(res.headers["content-length"] ?? 0);
        if (declared > MAX_VIDEO_BYTES) { res.resume(); reject(new Error("Video exceeds download size limit")); return; }
        let bytes = 0;
        const out = createWriteStream(destination, { flags: "wx" });
        res.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > MAX_VIDEO_BYTES || previouslyDownloaded + bytes > MAX_VIDEO_TOTAL_BYTES) res.destroy(new Error("Video exceeds download size limit"));
          else if (Date.now() > deadline) res.destroy(new Error("Video download timed out"));
        });
        res.pipe(out);
        out.once("finish", () => resolveResponse({ bytes }));
        out.once("error", reject);
        res.once("error", reject);
      });
      req.once("timeout", () => req.destroy(new Error("Video download timed out")));
      req.once("error", reject);
      req.end();
    });
    if (response.location) {
      if (redirects >= MAX_REDIRECTS) throw new Error("Too many video redirects");
      current = new URL(response.location, current);
      continue;
    }
    return response.bytes;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

export function mediaDirOf(staticDir: string, kind: "images" | "videos"): string {
  return join(resolve(staticDir), kind);
}
