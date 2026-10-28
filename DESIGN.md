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
  display:
    fontFamily: "Bangers, Impact, sans-serif"
    fontSize: "clamp(1.75rem, 5vw, 3.5rem)"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0.04em"
  headline:
    fontFamily: "Fredoka, Comic Neue, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.2
  title:
    fontFamily: "Fredoka, Comic Neue, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Nunito, Comic Neue, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "JetBrains Mono, Menlo, monospace"
    fontSize: "0.75rem"
    fontWeight: 500
    letterSpacing: "0.05em"
  sketch:
    fontFamily: "Caveat, cursive"
    fontSize: "1.25rem"
    fontWeight: 400
    lineHeight: 1.4
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

**Display Font:** Bangers (Impact fallback)
**Heading Font:** Fredoka (Comic Neue fallback)
**Body Font:** Nunito (Comic Neue fallback)
**Sketch Font:** Caveat (cursive fallback)
**Label/Mono Font:** JetBrains Mono (Menlo fallback)

**Character:** The pairing is a printing-shop conversation: Bangers shouts the headline from across the room, Fredoka carries the subhead with confident roundness, Nunito does the patient body work, and JetBrains Mono handles the registration marks and technical labels. Caveat is the hand-lettered margin note, used sparingly for personality.

### Hierarchy
- **Display** (400, clamp(1.75rem, 5vw, 3.5rem), line-height 1): Comic book cover titles. Splash text on hero sections. The only place Bangers is used. Letter-spacing 0.04em for optical balance.
- **Headline** (700, 1.5rem, line-height 1.2): Section titles, sidebar project names, modal headers. Fredoka at its boldest.
- **Title** (600, 1.125rem, line-height 1.3): Card titles, button text at large sizes, toast messages. Fredoka at medium weight.
- **Body** (400, 0.875rem, line-height 1.5): All running text. Paragraphs, descriptions, chat messages. Max line length 65-75ch. Nunito's rounded terminals maintain warmth at reading length.
- **Label** (500, 0.75rem, letter-spacing 0.05em): Status indicators, metadata, timestamps, technical data. JetBrains Mono uppercase for registration-mark precision.
- **Sketch** (400, 1.25rem, line-height 1.4): Decorative hand-lettered text. Tooltips, hint text, personality touches. Caveat only. Used no more than once per screen to preserve impact.

### Named Rules

**The One Display Rule.** Bangers appears at most once per screen. If a second element needs display weight, use Fredoka 700 at headline size. Display type that appears twice is display type that has lost its punch.

**The Mono-For-Data Rule.** JetBrains Mono is reserved for status labels, timestamps, technical identifiers, and code. Never use it for button labels, headings, or body text. If it reads like a registration mark, it belongs in Mono. If it reads like a sentence, it does not.

## 4. Elevation

The Comic Workbench uses CMYK offset shadows as structural elevation. Shadows are not ambient (they don't simulate light falling on objects); they are offset-printing registration marks that communicate layer identity. Each shadow layer is a "plate" with a specific color role.

### Shadow Vocabulary
- **Brutal** (`4px 4px 0px 0px rgb(var(--color-ink) / 0.3)`): Default card elevation. Single-plate offset shadow in the ink color. Used on card-doodle and btn-doodle.
- **Brutal Small** (`2px 2px 0px 0px rgb(var(--color-ink) / 0.3)`): Subtle elevation for small elements (chips, tags, inline badges).
- **Brutal Large** (`6px 6px 0px 0px rgb(var(--color-ink) / 0.3)`): Hover-state elevation. The shadow grows when the card is lifted.
- **Comic** (`4px 4px 0px 0px oklch(var(--cmyk-cyan) / 0.7), 7px 7px 0px 0px oklch(var(--cmyk-magenta) / 0.5)`): Two-plate CMYK shadow. Cyan first layer, magenta second layer, both theme-aware via `--cmyk-cyan` / `--cmyk-magenta`. Used on card-comic. Signals "this element has a distinct visual identity."
- **Comic Magenta** (`4px 4px 0px 0px oklch(var(--cmyk-magenta) / 0.7), 7px 7px 0px 0px rgb(var(--color-ink) / 0.3)`): Magenta first layer. Used for emphasis variants, pressed states, or elements that demand attention.
- **Comic Pop** (`5px 5px 0px 0px oklch(var(--cmyk-cyan) / 0.8), 9px 9px 0px 0px oklch(var(--cmyk-magenta) / 0.6)`): Larger CMYK shadow. Hover state for comic elements. The expanded offset signals "this plate has shifted during printing."

### Tonal Layering
- **Light theme**: Three cream surfaces (Workshop Cream/Linen/Ecru) form tonal layers without shadow. Panels and sidebars use Linen (#F0EFE6), the canvas uses Cream (#FAFAF5), and elevated inputs use Ecru (#E2E0D4).
- **Dark theme**: Three pressroom surfaces (Pressroom Base/Surface/Elevated) form the same tonal system. Shadow opacity increases from 0.25 to 0.4 in dark mode to maintain CMYK visibility against dark backgrounds.

### Named Rules

**The Offset-Is-Structure Rule.** CMYK shadows are structural elevation, not decorative drop shadows. A card-comic with its Comic shadow has higher visual weight than a card-doodle with its Brutal shadow. Removing a shadow changes the element's hierarchy, not just its decoration. Never remove a shadow for aesthetics alone.

**The Flat-At-Rest Rule.** Elements are flat (no translate) at rest. Hover lifts the element (-0.5px translate) and expands the shadow offset. Active presses the element (+1px translate) and collapses the shadow entirely. This physical model (lift, press, snap) is the tactile foundation.

## 5. Components

### Buttons
- **Shape:** Rounded (8px), bold 3px border, uppercase tracking
- **Primary (Inkwell Gold):** `btn-doodle` with `bg-primary text-primary-content`. 3px border in `ink/30`, brutal shadow, font-heading bold. Padding: md (20px 10px), lg (28px 12px).
- **Secondary:** `bg-surface text-ink border-border-strong`, hover `bg-paper-200`.
- **Ghost:** Transparent background, no border, no shadow. Hover adds `bg-paper-200` and `shadow-brutal-sm`.
- **Error:** `bg-error text-error-content`. Same shadow model.
- **Hover:** Translate -0.5px, shadow expands from brutal to brutal-lg (or comic to comic-pop for comic variants).
- **Active:** Translate +1px, shadow collapses to none. The button physically presses into the surface.
- **Disabled:** 50% opacity, cursor-not-allowed. No hover or active transforms.
- **Loading:** Project-owned CSS spinner replaces content. All interaction blocked.

### Cards / Containers
- **card-doodle:** Rounded-xl (16px), 3px border, brutal shadow. Background: Workshop Cream. Hover: -0.5px translate, shadow to brutal-lg. The default card for content sections.
- **card-comic:** Rounded-lg (12px), 3px border, comic shadow (cyan first plate). Background: Workshop Cream. Hover: comic-pop shadow. Dark mode hover: increased border and shadow opacity. The identity card for featured content and canvas sections.
- **Internal padding:** 24px (p-6) standard, 16px (p-4) compact.

### Inputs / Fields
- **input-doodle:** 3px border in `ink/30`, rounded-lg (8px), Workshop Cream background. Focus: border shifts to primary (Inkwell Gold). No glow, no ring, just a decisive border-color change.
- **Error state:** Border shifts to error color (`#C03A3A` light / `#E86868` dark). Error message in error color below.
- **Label:** font-heading medium weight, sitting above the input.

### Chips / Tags
- **Style:** Rounded-full, thin border, paper-200 surface. Selected state uses a primary tint.
- **State:** Unselected: paper-200 background, ink text. Selected: primary/10 background, primary text and border.

### Navigation
- **Sidebar:** 288px overlay panel (18rem, `--workbench-sidebar`), Pressroom Surface / Workshop Linen background. Active project: left border highlight in Inkwell Gold (3px). Project names in font-heading, compact row layout. Delete button revealed on hover only.
- **TopBar:** 44px height (2.75rem, `--workbench-header`), 2px thick bottom border, compact dot+icon+label stage indicators. Bold progress dots in stage accent color. Stage labels in font-heading.

### Speech Bubbles
- **speech-bubble:** Rounded-xl, paper-300/50 background, font-comic type. Left-pointing triangle arrow (6px border-width) for AI messages.
- **speech-bubble-user:** Rounded-xl, primary/10 background. Right-pointing triangle arrow for user messages. Dark mode: increased arrow opacity from 0.1 to 0.3.
- **Use case:** Chat panel messages. The directional arrows follow comic convention (left = incoming, right = outgoing).

### Halftone Backgrounds
- **halftone-bg:** Radial gradient dots in `ink / 0.08`, 7px grid. Standard background texture for sections needing surface identity.
- **halftone-bg-accent:** Dots in `primary / 0.16`, 7px grid. Accent variant for hero sections and featured areas.
- **Dark mode:** Opacity increases (0.08→0.2, 0.16→0.3) to maintain halftone visibility against dark surfaces.

## 6. Do's and Don'ts

### Do:
- **Do** use CMYK offset shadows to communicate visual hierarchy. A comic-shadow card has more weight than a brutal-shadow card.
- **Do** translate elements on hover/active for tactile press feedback: lift (-0.5px), then press (+1px).
- **Do** tint all neutrals warm (toward the yellow axis). Pure greys and blue-greys are SaaS territory.
- **Do** use halftone dot backgrounds as surface identity markers, especially on hero sections and canvas areas.
- **Do** keep Bangers display font to one appearance per screen. More dilutes its punch.
- **Do** use speech-bubble directional arrows to distinguish AI vs. user messages in chat.
- **Do** increase shadow and halftone opacity in dark mode (2-2.5x) to maintain CMYK visibility.
- **Do** use JetBrains Mono only for status labels, timestamps, and technical identifiers.

### Don't:
- **Don't** use pure #000 or #fff for any element. Every neutral must be tinted toward the brand hue.
- **Don't** create grey SaaS panels. If a sidebar looks like it belongs in Jira, it needs Workshop Linen warmth.
- **Don't** use generic AI tool aesthetics: white card grids with purple gradients are the exact opposite of The Comic Workbench.
- **Don't** apply childlike doodle aesthetics: over-rounded corners, candy colors, infantile typography. This is a professional workshop, not a sticker chart.
- **Don't** use border-left or border-right greater than 1px as a colored accent stripe. Use full borders, background tints, or nothing.
- **Don't** use gradient text (`background-clip: text` with gradient). Solid colors only.
- **Don't** use glassmorphism (blurs, glass cards) as default surface treatment.
- **Don't** decorate with CMYK shadows. If removing a shadow would change the hierarchy, it's structural and stays. If removing it changes nothing, it's decorative and must go.
- **Don't** use display fonts (Bangers) in UI labels, buttons, or data. Display is for splash, not for interaction.
- **Don't** reinvent standard affordances (custom scrollbars, weird form controls, non-standard modals). The workbench has familiar tools.
