---
name: openOii
description: "AI 漫剧生成平台：故事创意 → 3 Agent 协作 → 可视化漫剧成片"
colors:
  # light（:root）
  primary: "#2F4BC3"
  primary-hover: "#243BB2"
  primary-pressed: "#1B2C9D"
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
  dark-primary: "#96ACFE"
  dark-primary-hover: "#A6BCFF"
  dark-primary-pressed: "#8499E9"
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
    hoverBackgroundColor: "{colors.primary-hover}"
    activeBackgroundColor: "{colors.primary-pressed}"
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

**Shell geometry (tokens):**

| Token | Role |
|-------|------|
| `--workbench-header` | TopBar (2.75rem); on the workbench its centre holds the status pill and run actions |
| (none) | Agent 面板浮在画布左侧，固定 `w-[360px]`，可收成胶囊 |
| (none) | 检查器浮在画布右侧，固定 `w-80`（320px），可收成胶囊 |

**Studio 布局：全幅画布 + 浮层面板（ADR 0010，spec §5）：**

```
┌────────────────────────────────────────────────────────┐
│ TopBar  ·  状态胶囊 + 生成/停止                          │
├────────────────────────────────────────────────────────┤
│ ┌Agent 面板┐        Canvas 全幅            ┌检查器────┐ │
│ │活动/待处理│                              │选中项属性 │ │
│ └──────────┘        [画布工具条]            └─────────┘ │
│              ┌ PromptBar（≤720，居中）┐                 │
│              └────────────────────────┘                 │
└────────────────────────────────────────────────────────┘
```

1. **画布占满，面板浮在上面。** Agent 面板在左（360px），检查器在右（320px），都能收成胶囊。
   窄于 1440px 时 Agent 面板默认收起；窄于 1280px 时两者互斥，开一个就收另一个。
   手机（`<sm`）上没有画布：单列显示状态、待处理（同一个 InboxPanel）、成片/分镜预览和最近 5 条动态，
   底部提示用桌面端编辑完整画布。重试只在待处理和 TopBar。
2. **检查器承载一切属性面**，包括 Brief。未选中任何卡片时显示“项目”视图（Brief + 宇宙时间线）；
   换选中目标时自动展开，手动收起后同一选中不再弹开。
3. **PromptBar 浮在画布底部居中**（最宽 720px），是唯一的文本输入入口，「选中 → 提示 → 定点重跑」默认可见。
   - 左侧是 `逐步确认 / 自动确认` 开关；后面是上下文 chip：每个选中对象一个（可移除，画布选区同步），
     无选区时 `整个项目`，处于审批门时 `规划 · 待确认`。
   - Enter 发送，Shift+Enter 换行；占位文字随上下文变化。
   - 画布工具条叠在 PromptBar 上方；窄于 1400px 时工具条只显示图标，放得进两块面板之间。

**画布（React Flow，`@xyflow/react`）：** `canvas/flow/FlowWorkflowView.tsx` 渲染，
`toFlowNodes.ts` 把工作流图转成节点：每个 section 是一个 frame 父节点，卡片相对 frame 定位并限制在其内。
选择工具框选、滚轮平移；Shift/⌘/Ctrl 多选；分镜排序模式下只有镜头可拖（松手即 `reorderShots`），
自由布局模式只拖 frame（位置存 `localStorage`，「重置布局」清空）。适配视图避开两侧浮层和底部 PromptBar，
板子放得下就居中，否则从左上角开始。保留 React Flow 署名。

画布几何（卡片尺寸、九宫格列数、frame 内距 gap）的 SSOT 是
`app/features/comic-workflow/graph/layoutComicWorkflow.ts`——React Flow 消费的是
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
2. **Interaction soft freeze** — selection binding, the activity timeline and inbox, cell regenerate, generate/confirm/cancel keep meaning (ADR 0003).
3. **One display face per screen** — Bangers at most once.
4. **Dense chrome** — header/toolbar use `--touch-target-dense` for chips; primary actions keep `--touch-target-min` (44px).
5. **Shell classes** — TopBar → `.chrome-row` + `data-shell="topbar"`; StudioControls (status pill, run actions) → TopBar `center` slot, `data-shell="studio-controls"`; pages → `.page-shell` / `.page-body`.
6. **常驻非浮动面上限 3** — 第 4 个功能面一律走浮层/抽屉（yuuvis viewport architecture）。各面最小宽之和放不下时必须换布局模式，**不许按百分比切完再让面板重叠**。

**Program:** Full UI domains land in batches (`docs/frontend-redesign-program.md`).

## 1. Overview

**North star: a calm creation studio with a light comic accent.**

openOii is a tool for making comic videos, so the work (the storyboard) gets the screen and the chrome stays quiet.
The workbench is a full-bleed React Flow canvas; the agent panel, the inspector and the PromptBar float over it.
Warm grey paper and ink neutrals, one ultramarine (群青) brand hue, the system CJK font stack.
The comic identity survives only where spec §7.6 allows it: the Bangers wordmark, the final-video card and its
completion moment, and empty states.

It rejects three looks: cold grey SaaS (Jira), the generic AI generator (white card grids and purple gradients),
and heavy comic everywhere (offset shadows, halftone and display type on every surface).

**Key characteristics:**
- Full-bleed canvas, floating panels that collapse to pills (§0 layout).
- Borders and paper tones carry hierarchy; shadows are only for things that float.
- One place for each job: decisions in the 待处理 inbox, text input in the PromptBar, properties in the inspector.
- Light and dark themes (ADR 0010); every text token meets WCAG AA on every surface.
- Mobile is a read-and-decide view, not a canvas editor.

## 2. Colors

One brand hue (ultramarine, 群青) on calm warm-grey neutrals. Light and dark themes; the first visit follows `prefers-color-scheme`, the toggle persists (`data-theme="light" | "dark"`).

- **Primary** `#2F4BC3` (dark `#96ACFE`): primary actions, selection, focus ring, links, the wordmark and the favicon dot. Also legal as text on every surface (≥ 6:1 light, ≥ 7:1 dark).
- **Primary ramp**: `primary-hover` `#243BB2` / `primary-pressed` `#1B2C9D` (dark `#A6BCFF` / `#8499E9`, lighter on dark). Filled primary controls use `hover:bg-primary-hover active:bg-primary-pressed`, not alpha. `primary-content` stays ≥ 4.5:1 on all three; `themeContrast.test.ts` checks it.
- Ultramarine was chosen to stay clear of the teal `info` and storyboard accents and of the `error` red. The CMYK `--cmyk-magenta` plate on the final-video card is a print-registration accent, not the brand.
- **Neutrals**: `paper-100` page bg, `paper-200` sunken panes, `paper-300` sunken-on-sunken fills, `line` (ink 12%) hairline borders and dividers, `line-strong` (ink 22%) dashed drop zones, `surface` raised cards/dialogs, `border-strong` input/control borders (≥ 3:1).
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

- **Flat elements** (cards, list rows, inline buttons): 1px border only (`border-line`, or `border-border-strong` for controls). 2px is reserved for selection, active-tab underlines and left accent bars. No shadow.
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
- **Components:** `ui/Button` (variant `primary/secondary/ghost/danger`, size `sm/md/lg`), `ui/IconButton` (required `aria-label`), `ui/PlainButton` (unstyled, for tabs, menu items, selectable cards and rows). Native `<button` is only allowed in `components/ui` and the canvas cards; the contract test enforces it.
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
- **TopBar:** 44px (2.75rem, `--workbench-header`), 1px bottom border. On the workbench the centre holds the status pill (stage, progress, elapsed time) and 生成 / 停止.

### Activity timeline
- No chat bubbles. The agent panel shows a step timeline: a status dot (running pulses in primary, error in error), agent label, title, duration on the right, and a "N 项细节" disclosure for tool rows.
- Follows the newest entry; scrolling up stops following and shows "跳到最新".

### Dialogs
- Native `<dialog>` via `showModal()`, so the top layer sits above every floating panel. `.dialog-panel` with `shadow-dialog`.

### Approval inbox
- Every decision lives in the agent panel's 待处理 tab: approval gate (确认继续 / 提修改意见), interrupted run (继续 / 取消), blocking shots, last failure (从失败阶段重试). The top bar, prompt bar and cards don't repeat these buttons.
- A new item opens the panel on 待处理; clearing the inbox returns to 活动. In 自动确认 mode gates don't interrupt.

## 6. Do's and Don'ts

### Do:
- **Do** keep comic accents to the places listed in spec §7.6: the wordmark, the final-video card and its completion moment, and empty states.
- **Do** use borders and the paper tones for hierarchy; shadows are for things that float.
- **Do** use mono only for ids, durations and technical fields.
- **Do** keep one entry point per job (inbox for decisions, PromptBar for text, inspector for properties).
- **Do** run `impeccable detect` against the live pages before landing UI work: zero `low-contrast` and `undersized-ui-text`.

### Don't:
- **Don't** use pure #000 or #fff for any element. Every neutral must be tinted toward the brand hue.
- **Don't** create cold grey SaaS panels. Neutrals stay on the warm paper scale.
- **Don't** use generic AI tool aesthetics: white card grids with purple gradients are the opposite of this studio.
- **Don't** apply childlike doodle aesthetics: over-rounded corners, candy colors, infantile typography. This is a professional workshop, not a sticker chart.
- **Don't** use border-left or border-right greater than 1px as a colored accent stripe. Use full borders, background tints, or nothing.
- **Don't** use gradient text (`background-clip: text` with gradient). Solid colors only.
- **Don't** use glassmorphism (blurs, glass cards) as default surface treatment.
- **Don't** add offset hard shadows or halftone outside spec §7.6.
- **Don't** use display fonts (Bangers) in UI labels, buttons, or data. Display is for splash, not for interaction.
- **Don't** reinvent standard affordances (custom scrollbars, weird form controls, non-standard modals). The workbench has familiar tools.
- **Don't** pin a fourth always-on surface over the canvas; it goes into a panel tab, a popover or a dialog.
- **Don't** put text under 12px anywhere, including canvas labels.
