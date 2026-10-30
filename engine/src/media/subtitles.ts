/**
 * 字幕：从剧本台词生成（不做语音识别），时间按每个镜头在成片里的起点和配音时长排。
 * 纯函数放这里；ffmpeg 部分在 MediaService.addSubtitles。
 */

export type SubtitleMode = "off" | "soft" | "burn";

export function subtitleMode(value: unknown): SubtitleMode {
  const mode = String(value ?? "").trim().toLowerCase();
  return mode === "soft" || mode === "burn" ? mode : "off";
}

/** 一个镜头的台词：offset = 镜头在成片里的起点，window = 这句台词能占的时长（配音时长或估算值） */
export interface SubtitleSegment {
  offset: number;
  window: number;
  text: string;
}

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

/** 没有配音时按语速估算：每字约 0.24 秒，至少 1.2 秒 */
export function estimatedSpeechSeconds(text: string): number {
  return Math.max(1.2, [...text.replace(/\s+/g, "")].length * 0.24);
}

const BREAK_AFTER = new Set([..."。！？；，、：…!?;,:"]);
const STRIP_EDGE = /^[\s，、；：。,;:.]+|[\s，、；：。,;:.]+$/g;

/** 按标点切成每行不超过 maxChars 个字的小句；太长的小句硬切 */
export function splitSubtitleText(text: string, maxChars = 16): string[] {
  const clean = text.replace(/[「」『』“”"]/g, "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const phrases: string[] = [];
  let current = "";
  for (const ch of clean) {
    current += ch;
    if (BREAK_AFTER.has(ch)) {
      phrases.push(current);
      current = "";
    }
  }
  if (current) phrases.push(current);

  const lines: string[] = [];
  let line = "";
  const flush = () => {
    const trimmed = line.replace(STRIP_EDGE, "");
    if (trimmed) lines.push(trimmed);
    line = "";
  };
  for (const phrase of phrases) {
    const chars = [...phrase];
    if (chars.length > maxChars) {
      flush();
      for (let i = 0; i < chars.length; i += maxChars) {
        line = chars.slice(i, i + maxChars).join("");
        flush();
      }
      continue;
    }
    if ([...line].length + chars.length > maxChars) flush();
    line += phrase;
  }
  flush();
  return lines;
}

/** 每个镜头的台词按字数比例分到它的时间窗里 */
export function buildSubtitleCues(segments: SubtitleSegment[], maxChars = 16): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  for (const segment of segments) {
    const lines = splitSubtitleText(segment.text, maxChars);
    if (lines.length === 0 || segment.window <= 0.2) continue;
    const total = lines.reduce((sum, l) => sum + [...l].length, 0);
    let t = segment.offset;
    for (const l of lines) {
      const span = (segment.window * [...l].length) / total;
      cues.push({ start: t, end: t + span, text: l });
      t += span;
    }
  }
  return cues;
}

function clock(seconds: number, sep: "," | "."): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(totalMs / 3_600_000);
  const m = Math.floor((totalMs % 3_600_000) / 60_000);
  const s = Math.floor((totalMs % 60_000) / 1000);
  const ms = totalMs % 1000;
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return sep === ","
    ? `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`
    : `${h}:${pad(m)}:${pad(s)}.${pad(Math.floor(ms / 10))}`;
}

export function renderSrt(cues: SubtitleCue[]): string {
  return cues
    .map((cue, i) => `${i + 1}\n${clock(cue.start, ",")} --> ${clock(cue.end, ",")}\n${cue.text}\n`)
    .join("\n");
}

/** 字号和安全区按画面尺寸算：字高约为短边的 5.5%，底边留 7%，左右各留 7% */
export function subtitleLayout(width: number, height: number) {
  const fontSize = Math.max(18, Math.round(Math.min(width, height) * 0.055));
  const marginV = Math.round(height * 0.07);
  const marginH = Math.round(width * 0.07);
  const maxChars = Math.max(8, Math.min(16, Math.floor((width - 2 * marginH) / fontSize)));
  return { fontSize, marginV, marginH, maxChars };
}

export function renderAss(cues: SubtitleCue[], width: number, height: number, font: string): string {
  const { fontSize, marginV, marginH } = subtitleLayout(width, height);
  const outline = Math.max(2, Math.round(fontSize * 0.08));
  const safeFont = font.replace(/[,\r\n]/g, " ").trim() || "Noto Sans CJK SC";
  const escape = (text: string) => text.replace(/\\/g, "＼").replace(/[{}]/g, "").replace(/\n/g, "\\N");
  return [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "ScaledBorderAndShadow: yes",
    "WrapStyle: 2",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Default,${safeFont},${fontSize},&H00FFFFFF,&H00FFFFFF,&H00141414,&H64000000,0,0,0,0,100,100,1,0,1,${outline},1,2,${marginH},${marginH},${marginV},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ...cues.map((cue) => `Dialogue: 0,${clock(cue.start, ".")},${clock(cue.end, ".")},Default,,0,0,0,,${escape(cue.text)}`),
    "",
  ].join("\n");
}
