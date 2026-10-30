import type { DurationRule } from "./types.js";

/** 把分镜时长落到服务商允许的值：区间取整夹紧，枚举取最近（并列取较长）。 */
export function fitDuration(rule: DurationRule, seconds: number): number {
  const value = Number.isFinite(seconds) && seconds > 0 ? seconds : 5;
  if (!Array.isArray(rule)) return Math.min(rule.max, Math.max(rule.min, Math.round(value)));
  let best = rule[0] ?? 5;
  for (const option of rule) {
    const gap = Math.abs(option - value);
    const bestGap = Math.abs(best - value);
    if (gap < bestGap || (gap === bestGap && option > best)) best = option;
  }
  return best;
}

/** 画幅：在允许列表里就原样用，否则用第一个（默认 16:9）。 */
export function fitRatio(allowed: readonly string[], ratio: string): string {
  return allowed.includes(ratio) ? ratio : allowed[0]!;
}

/** data:image/png;base64,xxx → { mime, base64 }；不是 data URL 返回 null。 */
export function splitDataUrl(url: string): { mime: string; base64: string } | null {
  const match = /^data:([^;,]+);base64,(.*)$/s.exec(url);
  return match ? { mime: match[1]!, base64: match[2]! } : null;
}

export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}
