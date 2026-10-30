import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface, type Interface } from "node:readline";
import { resolve } from "node:path";

type PendingRequest = {
  resolve: (line: string) => void;
  reject: (error: Error) => void;
};

export interface AudioResult {
  video_url: string;
  tts_url: string | null;
  bgm_type: string | null;
  /** 配音服务商失败的原因（不含密钥）；成功或未配音时为 null */
  tts_error: string | null;
}

export interface BgmTrackResult {
  track_url: string | null;
  /** library / minimax / stability / suno */
  source: string | null;
  mood: string | null;
  /** 云端服务商失败的原因（已退回本地曲库）；不含密钥 */
  fallback_reason: string | null;
}

/** Reuse the backend's existing image, face, and audio helpers from Engine. */
export class BackendWorker {
  private child: ChildProcessWithoutNullStreams | null = null;
  private lines: Interface | null = null;
  private pending: PendingRequest | null = null;
  private errors = "";
  private abort?: () => void;

  constructor(private readonly signal: AbortSignal) {}

  async faceEmbedding(image: Buffer): Promise<number[] | null> {
    const value = await this.request({
      action: "face_embedding",
      image: image.toString("base64"),
    });
    if (
      !Array.isArray(value) ||
      value.length !== 512 ||
      !value.every((item) => typeof item === "number" && Number.isFinite(item))
    ) {
      return null;
    }
    return value as number[];
  }

  async characterReference(urls: string[]): Promise<Buffer> {
    return this.imageRequest({ action: "character_reference", urls });
  }

  async nineGridReference(args: {
    current: string;
    previous?: string | null;
    next?: string | null;
    characters: string[];
  }): Promise<Buffer> {
    return this.imageRequest({ action: "nine_grid_reference", ...args });
  }

  async processAudio(args: {
    video_url: string;
    dialogue: string | null;
    speaker: { name: string; description: string | null } | null;
    /** 角色指定的音色；为空时由 backend 按服务商默认或角色描述挑选 */
    voice: string | null;
    scene: string | null;
    expression: string | null;
    genre: string | null;
    settings: {
      text_provider: string;
      image_provider: string;
      video_provider: string;
      tts_enabled: boolean;
      tts_provider: string;
      tts_base_url: string | null;
      tts_api_key: string | null;
      tts_model: string | null;
      tts_default_voice: string;
      tts_volume: number;
      bgm_enabled: boolean;
      bgm_volume: number;
      bgm_directory: string;
    };
  }): Promise<AudioResult> {
    const value = await this.request({ action: "process_audio", ...args });
    if (!value || typeof value !== "object") throw new Error("invalid audio result");
    const result = value as Partial<AudioResult>;
    if (typeof result.video_url !== "string") throw new Error("audio result has no video URL");
    return {
      video_url: result.video_url,
      tts_url: typeof result.tts_url === "string" ? result.tts_url : null,
      bgm_type: typeof result.bgm_type === "string" ? result.bgm_type : null,
      tts_error: typeof result.tts_error === "string" ? result.tts_error : null,
    };
  }

  /** One background track for the whole film (local library or a cloud music provider). */
  async bgmTrack(args: {
    texts: string[];
    genre: string | null;
    duration: number;
    settings: {
      bgm_provider: string;
      bgm_base_url: string | null;
      bgm_api_key: string | null;
      bgm_model: string | null;
      bgm_directory: string;
    };
  }): Promise<BgmTrackResult> {
    const value = await this.request({ action: "bgm_track", ...args });
    if (!value || typeof value !== "object") throw new Error("invalid bgm result");
    const result = value as Partial<BgmTrackResult>;
    return {
      track_url: typeof result.track_url === "string" ? result.track_url : null,
      source: typeof result.source === "string" ? result.source : null,
      mood: typeof result.mood === "string" ? result.mood : null,
      fallback_reason: typeof result.fallback_reason === "string" ? result.fallback_reason : null,
    };
  }

  async close(): Promise<void> {
    const child = this.child;
    if (!child) return;
    await new Promise<void>((resolveClose) => {
      child.once("close", () => resolveClose());
      child.stdin.end();
    });
  }

  private async imageRequest(request: Record<string, unknown>): Promise<Buffer> {
    const value = await this.request(request);
    if (typeof value !== "string") throw new Error("invalid image composition result");
    return Buffer.from(value, "base64");
  }

  private async request(request: Record<string, unknown>): Promise<unknown> {
    const child = this.start();
    const line = await new Promise<string>((resolveLine, reject) => {
      this.pending = { resolve: resolveLine, reject };
      child.stdin.write(`${JSON.stringify(request)}\n`, (error?: Error | null) => {
        if (error) this.fail(child, error);
      });
    });
    const value: unknown = JSON.parse(line);
    if (value && typeof value === "object" && "error" in value) {
      throw new Error(String((value as { error: unknown }).error));
    }
    return value;
  }

  private start(): ChildProcessWithoutNullStreams {
    if (this.child) return this.child;
    if (this.signal.aborted) throw new Error("backend worker cancelled");

    const python = process.env.ENGINE_PYTHON ?? "python";
    const cwd = process.env.ENGINE_BACKEND_DIR ?? resolve(process.cwd(), "../backend");
    const child = spawn(python, ["-m", "app.services.engine_media_cli"], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      detached: process.platform !== "win32",
    }) as ChildProcessWithoutNullStreams;
    this.child = child;
    this.errors = "";
    child.stderr.setEncoding("utf8");
    let errors = "";
    child.stderr.on("data", (chunk: string) => {
      errors = `${errors}${chunk}`.slice(-4000);
      if (this.child === child) this.errors = errors;
    });
    this.lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
    this.lines.on("line", (line) => {
      if (this.child !== child) return;
      const pending = this.pending;
      if (!pending) return;
      this.pending = null;
      pending.resolve(line);
    });
    this.abort = () => {
      this.fail(child, new Error("backend worker cancelled"));
      if (process.platform === "win32" || !child.pid) {
        child.kill("SIGTERM");
        return;
      }
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {
        child.kill("SIGTERM");
      }
    };
    this.signal.addEventListener("abort", this.abort, { once: true });
    if (this.signal.aborted) this.abort();
    child.once("error", (error) => this.fail(child, error));
    child.once("close", (code) => this.fail(child, new Error(`backend worker exited ${code}: ${errors}`)));
    return child;
  }

  private fail(child: ChildProcessWithoutNullStreams, error: Error): void {
    if (this.child !== child) return;
    const pending = this.pending;
    this.pending = null;
    pending?.reject(error);
    this.lines?.close();
    this.lines = null;
    this.child = null;
    if (this.abort) this.signal.removeEventListener("abort", this.abort);
    this.abort = undefined;
  }
}
