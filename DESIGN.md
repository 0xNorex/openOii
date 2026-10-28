---
name: openOii
description: "AI 漫剧生成平台：故事创意 → 3 Agent 协作 → 可视化漫剧成片"
colors:
  # light（:root）
  primary: "#B0215F"
  primary-content: "#FFFFFF"
  neutral: "#1C1C22"
  neutral-content: "#ECECF1"
  surface: "#FFFFFF"
  paper-100: "#F7F7F4"
  paper-200: "#EFEEE9"
  paper-300: "#DEDDD6"
  border-strong: "#8A8A94"
  ink: "#1C1C22"
  ink-muted: "#5B5B66"
  info: "#0B6E7F"
  success: "#1F7A4D"
  warning: "#9A5B00"
  error: "#B42318"
  # dark（[data-theme="dark"]）
  dark-primary: "#F27AAE"
  dark-primary-content: "#121216"
  dark-surface: "#1B1B21"
  dark-paper-100: "#121216"
  dark-paper-200: "#24242C"
  dark-paper-300: "#33333D"
  dark-border-strong: "#6E6E7A"
  dark-ink: "#ECECF1"
  dark-ink-muted: "#A3A3AF"
  dark-info: "#5FCFE0"
  dark-success: "#6FD3A0"
  dark-warning: "#F2B35A"
  dark-error: "#FF8A80"
typography:
  brand:
    fontFamily: "Bangers, var(--font-sans)"
    note: "wordmark only"
  sans:
    fontFamily: "system CJK stack: -apple-system, PingFang SC, Microsoft YaHei, Noto Sans CJK SC, system-ui"
  mono:
    fontFamily: "ui-monospace, SF Mono, Menlo, Consolas, Noto Sans Mono CJK SC"
    note: "ids (S01), durations, technical fields only"
rounded:
  sm: "4px"
  md: "6px"
  lg: "10px"
  xl: "10px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
  "10": "40px"
  "12": "48px"
alpha:
  rule: "5 的倍数；/8 /12 /65 这类随手档已收敛"
  common: "5 10 15 20 30 40 50 70 90"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-content}"
    rounded: "{rounded.md}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    borderColor: "{colors.border-strong}"
    rounded: "{rounded.md}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
  card:
    backgroundColor: "{colors.paper-100}"
    rounded: "{rounded.lg}"
  input:
    backgroundColor: "{colors.paper-100}"
    rounded: "{rounded.md}"
---

# Design System: openOii

## 0. Design Contract (executable)

**Authority:** `frontend/app/styles/tokens.css` is the source of truth. This document is human-readable; update it in the **same PR** when tokens change (ADR 0002).

**Direction (ADR 0010, supersedes D2):** professional creation studio with light comic accents. Light **and** dark themes (default follows the system). Comic accents (Bangers wordmark, CMYK offset frame, halftone) only on the wordmark, the final-video card and moment, and empty states. Not cold SaaS grey; not heavy comic. Spec: `docs/specs/frontend-studio-redesign.md`.

> **Transition note:** the front-matter values and §1–§6 below still describe the tokens shipped today. They are rewritten in the same PR that changes `tokens.css` (Phase 1 of `docs/specs/frontend-studio-redesign-plan.md`, ADR 0002). Where they conflict with ADR 0010, ADR 0010 wins.

**Shell geometry (tokens):**

| Token | Role |
|-------|------|
| `--workbench-header` / `--workbench-toolbar` | TopBar + stage row (each 2.75rem) |
| `--workbench-activity` / `-collapsed` | 左栏 Agent Activity width (18rem / 2.75rem rail) |
| `--workbench-inspector` / `-collapsed` | 右栏检查器 width (20rem / 2.75rem rail) |

**Workbench 四区骨架（现状；ADR 0010 Phase 2 起改为“全幅画布 + 浮层面板”的 Studio 布局，见 spec §5）：**

```
┌────────────────────────────────────────────────────────┐
│ TopBar                                                  │
├────────────┬──────────────────────────┬────────────────┤
│ Activity   │ StagePipeline            │ Inspector      │
│ (常驻左栏) ├──────────────────────────┤ (选中即开)      │
│ 活动/资产/  │ Canvas  弹性 1fr         │ 概览/内容/操作  │
│ 宇宙        ├──────────────────────────┤                │
│            │ PromptBar 常驻            │                │
└────────────┴──────────────────────────┴────────────────┘
```

1. **三栏都是常驻栏，画布是唯一弹性面** —— Activity 与 Inspector 都不再
   `position: absolute` 浮在画布上。窄屏（`<lg`）：Inspector 不渲染，
   Activity 回到文档流。
2. **Inspector 承载一切属性面**，包括 Brief。画布上只有
   Elements → 九宫格 → Output 三列——它们需要在空间里互相对照；
   Brief 是项目级上下文，不必占画布栏位。
3. **PromptBar 常驻画布下方**，不藏在侧栏 tab 里。「选中 → 提示 → 定点重跑」
   的入口必须在默认状态下可见。
4. **Inspector 默认展开**，可手动收起成窄轨；换选中目标时重新展开。
   未选中任何卡片时回落到 Brief，项目级上下文永远可达。

画布几何（卡片尺寸、九宫格列数、frame 内距 gap）的 SSOT 是
`app/features/comic-workflow/graph/layoutComicWorkflow.ts`——tldraw 消费的是
px 数值，tokens.css 不保留 rem 副本（避免两套数字漂移）。

**Token → Utility 映射（强制）：**

`tailwind.config.ts` 的 `theme.extend` 把 token 映射成裸类，**源码里必须写裸类**：

| token | 写字 | 禁止写 |
|-------|------|--------|
| `--text-sm` | `text-sm` | ~~`text-[length:var(--text-sm)]`~~ |
| `--radius-md` | `rounded-md` | ~~`rounded-[var(--radius-md)]`~~ |
| `--z-popover` | `z-popover` | ~~`z-[var(--z-popover)]`~~、~~`z-50`~~ |
| `--duration-fast` | `duration-fast` | ~~`duration-[var(--duration-fast)]`~~、~~`duration-150`~~ |
| `--leading-tight` | `leading-tight` | ~~`leading-4`~~ |
| `--rhythm-zone` | `gap-5` | ~~`gap-[var(--rhythm-zone)]`~~ |

不透明度阶梯只允许 5 的倍数（`ink/8` 这类随手档已收敛）。
focus ring 不手写：全局 `:focus-visible` 已是 2px primary outline，别再加 `focus-visible:outline-*` / `ring-*`。
执行者：`app/styles/designContract.test.ts`（几何）+ `themeContrast.test.ts`（颜色）。

**Layout rules:**

1. **No document scroll** — `html`/`body`/`#root` overflow hidden; only `.page-body` / panel panes scroll.
2. **Interaction soft freeze** — selection binding, Agent Column chat, cell regenerate, generate/confirm/cancel keep meaning (ADR 0003).
3. **One display face per screen** — Bangers at most once.
4. **Dense chrome** — header/toolbar use `--touch-target-dense` for chips; primary actions keep `--touch-target-min` (44px).
5. **Shell classes** — TopBar → `.chrome-row` + `data-shell="topbar"`; StagePipeline → `.chrome-toolbar` + `data-shell="stage-pipeline"`; pages → `.page-shell` / `.page-body`.
6. **常驻非浮动面上限 3** — 第 4 个功能面一律走浮层/抽屉（yuuvis viewport architecture）。各面最小宽之和放不下时必须换布局模式，**不许按百分比切完再让面板重叠**。

**Program:** Full UI domains land in batches (`docs/frontend-redesign-program.md`).

## 1. Overview

**Creative North Star: "The Comic Workbench"**

A comic artist's workbench: professional, energetic, and immediately recognizable as a craft space, not a corporate tool. The surface is warm cream paper under ink. CMYK offset shadows and halftone dot textures are structural references to the printing process that gives comics their visual identity. Every design choice answers "does this feel like the workshop where comics get made?"

The system speaks two fluencies simultaneously: comic-book visual language (Bangers display type, CMYK shadows, halftone backgrounds, speech-bubble chat) and tool-clarity interaction (predictable grid layouts, consistent component vocabulary, 200ms state transitions). Comic energy without comic chaos. The workbench has inks, ruling pens, and registration marks, but the artist reaches for the right tool without thinking.

This system explicitly rejects three aesthetics: the grey SaaS panel (Notion/Jira coldness), the generic AI generator (white card grids + purple gradients), and the childlike doodle (over-rounded corners, candy colors, infantile typography). If it looks like a Jira ticket, the warmth is missing. If it looks like a Midjourney landing page, the personality is missing. If it looks like a kindergarten sticker chart, the craft is missing.

**Key Characteristics:**
- CMYK offset shadows as structural elevation, not decoration
- Halftone dot textures as surface identity markers
- Speech-bubble chat pattern grounded in comic convention
- Tactile button press (translate on active, shadow collapse) with physical feedback
- Dual-theme: light / dark, both kept (ADR 0010)
- **Dense desk density** — more cells and messages on screen without losing craft identity

## 2. Colors

One brand hue (magenta-rose) on calm warm-grey neutrals. Light and dark themes; the first visit follows `prefers-color-scheme`, the toggle persists (`data-theme="light" | "dark"`).

- **Primary** `#B0215F` (dark `#F27AAE`): primary actions, selection, focus ring, links. Also legal as text on every surface (≥ 4.5:1).
- **Neutrals**: `paper-100` page bg, `paper-200` sunken panes, `paper-300` hairline borders, `surface` raised cards/dialogs, `border-strong` input/control borders (≥ 3:1).
- **Text**: `ink` (≥ 7:1), `ink-muted` (hex, ≥ 4.5:1 on every surface), `ink-subtle` (alpha, ≥ 3:1, placeholders/meta only).
- **Status**: `info` / `success` / `warning` / `error`. Text uses `text-{k}-fg`; tinted backgrounds use `bg-{k}-bg` (alpha from `--status-bg-alpha`); filled badges use `bg-{k} text-{k}-content`.
- **Removed**: `secondary`, `accent`, `primary-ink`, `text-2xs`. The contract test fails if they come back.

### Scales

- **Type**: xs 12 / sm 14 / base 16 / md / lg / xl / 2xl 24. 12px is the floor.
- **Radius**: sm 4 (chips), md 6 (controls), lg 10 (cards, panels, dialogs).
- **Elevation**: `shadow-panel` (floating panels, popovers), `shadow-dialog` (dialogs).
- **Z**: `z-panel` 20 → `z-popover` 40 → `z-toast` 60 → `z-tooltip` 70.

Executable checks: `themeContrast.test.ts` (both themes) and `designContract.test.ts`.

## 3. Typography

- **Sans** (`font-sans`, the default): the system CJK stack in `--font-sans`. No Chinese webfont is bundled; self-hosted installs need no font CDN.
- **Mono** (`font-mono`): ids such as S01, durations and technical fields. Never for Chinese labels.
- **Brand** (`font-brand`): Bangers, Latin only, for the `OPENOII` wordmark. It is the only bundled webfont.
- Headings are `font-sans` with `font-semibold` or `font-bold`; there is no separate heading face.
- Chinese text has no letter-spacing and no italics.

## 4. Elevation

- **Flat elements** (cards, list rows, inline buttons): 1px border only (`border-paper-300`, or `border-border-strong` for controls). No shadow.
- **Floating panels, popovers, toasts, the canvas toolbar:** `shadow-panel`.
- **Dialogs:** `shadow-dialog` on `.dialog-panel`.
- **Comic accent** (spec §7.6): `.comic-frame` — 2px ink border plus a 3px CMYK cyan/magenta offset. Only on the final-video card. `designContract.test.ts` bans `shadow-brutal*`, `shadow-comic*`, `halftone*` and keeps `comic-frame` in its whitelist file.
- No hover lift, no press translate.

## 5. Components

### Buttons
- **Shape:** `rounded-md` (6px), 1px border, `font-semibold`, no uppercase.
- **Primary:** `bg-primary text-primary-content`.
- **Secondary:** `bg-surface text-ink border-border-strong`, hover `bg-paper-200`.
- **Ghost:** transparent, no border; hover `bg-paper-200`.
- **Danger:** `bg-error text-error-content`.
- **Components:** `ui/Button` (variant `primary/secondary/ghost/danger`, size `sm/md/lg`), `ui/IconButton` (required `aria-label`), `ui/PlainButton` (unstyled, for tabs, menu items, selectable cards and rows). Native `<button` is only allowed in `components/ui` and the tldraw canvas; the contract test enforces it.
- **Disabled:** 50% opacity, `cursor-not-allowed`.

### Cards / Containers
- **card-doodle:** `rounded-lg` (10px), 1px `border-paper-300`, `bg-paper-100`; hover border `border-strong`. No shadow.
- **Final-video card:** `.comic-frame` (see §4).

### Inputs / Fields
- **input-doodle:** 1px `border-border-strong`, `rounded-md`, `bg-paper-100`. Focus: border turns primary plus the global focus ring.

### Chips / Tags
- **Style:** Rounded-full, thin border, paper-200 surface. Selected state uses a primary tint.
- **State:** Unselected: paper-200 background, ink text. Selected: primary/10 background, primary text and border.

### Navigation
- **Sidebar:** 288px overlay panel (18rem, `--workbench-sidebar`), `bg-paper-100`. Active project uses a primary tint. Delete button revealed on hover only.
- **TopBar:** 44px height (2.75rem, `--workbench-header`), 2px thick bottom border, compact dot+icon+label stage indicators. Bold progress dots in stage accent color. Stage labels semibold.

### Chat bubbles
- **speech-bubble** (agent): `bg-paper-200`, `rounded-lg`, no tail.
- **speech-bubble-user**: `bg-primary/10`, `rounded-lg`, no tail.

## 6. Do's and Don'ts

### Do:
- **Do** keep comic accents to the places listed in spec §7.6: the wordmark, the final-video card and its completion moment, and empty states.
- **Do** use borders and the paper tones for hierarchy; shadows are for things that float.
- **Do** use mono only for ids, durations and technical fields.

### Don't:
- **Don't** use pure #000 or #fff for any element. Every neutral must be tinted toward the brand hue.
- **Don't** create grey SaaS panels. If a sidebar looks like it belongs in Jira, it needs Workshop Linen warmth.
- **Don't** use generic AI tool aesthetics: white card grids with purple gradients are the exact opposite of The Comic Workbench.
- **Don't** apply childlike doodle aesthetics: over-rounded corners, candy colors, infantile typography. This is a professional workshop, not a sticker chart.
- **Don't** use border-left or border-right greater than 1px as a colored accent stripe. Use full borders, background tints, or nothing.
- **Don't** use gradient text (`background-clip: text` with gradient). Solid colors only.
- **Don't** use glassmorphism (blurs, glass cards) as default surface treatment.
- **Don't** add offset hard shadows or halftone outside spec §7.6.
- **Don't** use display fonts (Bangers) in UI labels, buttons, or data. Display is for splash, not for interaction.
- **Don't** reinvent standard affordances (custom scrollbars, weird form controls, non-standard modals). The workbench has familiar tools.
