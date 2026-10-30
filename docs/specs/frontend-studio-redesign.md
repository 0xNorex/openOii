# 前端重设计 Spec：AI 原生创作台（Studio）

- 状态：草案，待评审
- 日期：2026-10-28
- 决策：ADR 0010（部分取代 ADR 0001、0003、0009）
- 计划：`docs/specs/frontend-studio-redesign-plan.md`
- 画布选型：`docs/research/canvas-evaluation.md`
- 审计依据：本地 Impeccable 审计 `.devdata/frontend-audit.md`。总分 11/20（Acceptable），Nielsen 评分 21/40。关键发现摘录见 §14。
- 总原则：**KISS**。能删就删，每类需求只保留一个原语，不引入不必要的依赖。

---

## 1. 目标

1. **作品为主角**：画布全幅显示，角色、分镜、成片的图像和视频在默认缩放下就能看清。
2. **过程透明**：用"活动时间线"（步骤 / 工具 / 结果 / 耗时）替代聊天气泡。
3. **审批只在一处处理**：所有待确认、可恢复、阻塞、失败事项都进同一个"待处理"收件箱。
4. **状态只有一个来源**：任何位置显示的项目或运行状态都由同一个函数推导，不再出现互相矛盾的状态。
5. **专业工具外观，漫画元素只作点缀**：漫画元素只出现在规定的少数位置（§7.6）。
6. **可访问、读得清**：最小字号 12px，文字对比度达到 WCAG 2.2 AA，两套主题都要达标。
7. **更小更简单**：删掉一致性雷达、创作访谈、死代码和重复原语；用 MIT 许可的 React Flow 替换 tldraw。

## 2. 非目标

- 不做多语言，界面只有中文。
- 不做多人协作，不做账号体系。
- 移动端不做编辑。
- 不做自由绘图、白板或便签。
- 不改设置里的字段：数据库和服务配置项**暂时保留**，本期只修设置弹窗被遮挡的问题和视觉样式。
- 不改后端工作流语义。后端改动只限于两类：删除已经没有前端调用的接口，以及必要时追加可选字段（§12）。

## 3. 用户

| 画像 | 场景 | 设计含义 |
|---|---|---|
| **作者本人 / 核心维护者** | 本地或自托管，桌面端反复迭代一个项目 | 选中 → 提示 → 定向重做要快；状态必须真实 |
| **自托管开源用户** | 按 README 部署到自己的服务器，可能用 HTTPS 域名 | 开箱即用：不能有需要 key 的依赖（tldraw 出局），不加载外部字体 CDN |
| **移动端访问者**（同一批人） | 手机上查看进度、点确认、下载成片 | 只读加审批，不编辑 |

## 4. 信息架构

| 路由 | 页面 | 变化 |
|---|---|---|
| `/` | 创作首页 | 保留输入框和模式选择；新增"最近项目"（3 个）和示例提示；**删除创作访谈**，提交后直接创建项目并启动运行 |
| `/projects` | 项目列表 | 状态取自 SSOT；批量删除改为"选择模式"，选中后才出现 |
| `/project/:id`（以及 `/projects/:id`） | **Studio 创作台** | 本 spec 的主体（§5） |
| `/universes`、`/universes/:id` | 宇宙 | 保留功能，只换视觉 |
| 设置 | 全局弹窗 | 保留全部字段；改用原生 `<dialog>`，修复遮挡（P0） |

全局 TopBar 高 48px，包含：

- 左侧：字标 `OPENOII`（Bangers）、项目切换器、主导航（创作 / 项目 / 宇宙）；
- 右侧：主题切换、设置。

在 Studio 页面里，TopBar 中部额外显示**状态胶囊**和**主操作按钮**，替代原来的 StagePipeline 整行。

## 5. Studio 布局（桌面，宽度 ≥1024px）

```
┌ TopBar 48 ───────────────────────────────────────────────────────────────┐
│ OPENOII / 项目名▾  创作 项目 宇宙      [● 待确认 · 故事大纲]  [继续▾][停止]   ☾ ⚙ │
├──────────────────────────────────────────────────────────────────────────┤
│ ┌ Agent 面板 360 ───┐                                  ┌ Inspector 320 ──┐ │
│ │ 活动 │ 待处理 ②    │                                  │ 选区 · 分镜 S01  │ │
│ │ ▸ 规划 · 2.1s ✓   │        画布（全幅，React Flow）     │ 属性             │ │
│ │ ▸ 角色 · 进行中…  │    角色行 → 分镜网格 → 成片          │ 生成             │ │
│ │   └ 工具: 文生图   │                                  │ 历史 / 对比      │ │
│ └──────────────────┘                                  └─────────────────┘ │
│  [− 80% + ⤢ 排序 补帧 资产]     ┌ PromptBar（max 720）───────────────┐      │
│                                 │ [分镜 S01 ×] [角色 小猫 ×]            │      │
│                                 │ 描述如何调整所选内容…           [发送] │      │
│                                 └─────────────────────────────────────┘      │
└──────────────────────────────────────────────────────────────────────────┘
```

### 5.1 区域与规则

1. **画布**占满 TopBar 以下的全部区域，是唯一的弹性面。
   - Agent 面板、Inspector、PromptBar 和画布工具条都以**浮层**形式悬浮在画布上，距离边缘 12px。
   - 做"适配视图"时，fitView 的内边距要算入当前打开的浮层宽度，保证作品不会被浮层盖住。这一点在 Phase 3 里验证 React Flow 的分边 padding 能力；如果不支持，就自己算 viewport。
2. **默认缩放**：首次进入时按"分镜网格"适配，而不是按全部内容适配，并设置可读下限：卡片标题在屏幕上至少 12px。修复审计 F3（59% / 44% 缩放）。
   - 更新（#46）：改为适配整块画布（角色、分镜、成片），打开的浮层面板算作左右留白；不再设可读下限，最小缩放与画布一致（0.2）。
   - 更新（#47）：自动适配仍以整块画布为目标，但缩放不低于可读下限 12/13；整块放不下时停在下限、以分镜区为中心，两侧 frame 可以被裁掉。手动缩放仍可到 0.2。
3. **Agent 面板**（左，360px，**默认展开**）有两个 tab：
   - **活动**：时间线，见 §5.3；
   - **待处理**：收件箱，tab 上带数量徽标，见 §6。
   - 面板可以收起成一个胶囊（显示待处理数量）。有新的待处理事项时，自动展开并切到"待处理"。
4. **Inspector**（右，320px）：
   - 选中对象时自动打开（ADR 0009 决策 4 不变）。
   - 取消选中时**不收起**，而是回落到**项目**视图：Brief 加宇宙时间线，后者从原侧栏迁入。
   - 用户可以手动收起成窄轨，或按 Esc 收起。
   - 视口宽度小于 1280px 时，Agent 面板和 Inspector **同时只展开一个**：展开其中一个，另一个自动收起。
5. **PromptBar**（底部居中，最大宽 720px）是**唯一的文本输入入口**，承载三类输入：
   - 生成提示；
   - 对选中对象的定向修改；
   - 审批时"提修改意见"。
   - 交互细节见 §5.4。
6. **画布工具条**（左下）：缩放、适配、排序模式、补帧（图 / 视频）、资产（打开 AssetDrawer）。
7. **原 StagePipeline 整行删除**。阶段信息并入状态胶囊（§6.1）和活动时间线，画布因此多出 44px 高度。
8. **常驻面上限**：画布加最多 2 个浮层面板。其他功能（资产、历史、版本对比、设置）一律走 Drawer 或 Dialog。

### 5.2 画布内容

画布内容沿用 `buildComicWorkflow` 生成的图和 `layoutComicWorkflow` 算出的布局，**数据模型不变**。

| 节点 | 内容 | 交互 |
|---|---|---|
| 角色卡 | 头像图、名称、状态点 | 选中 → Inspector |
| 分镜网格（分组） | 标题"分镜 · N 格"，网格内是分镜卡 | 排序模式下，拖动后按位置重排，调用 `PATCH /shots/reorder` |
| 分镜卡 | 首帧图（或视频封面）、`S01` 编号、一行描述、状态点 | 单击选中；双击打开预览；**卡片上不再放"通过 / 重做"按钮**（移到 Inspector 的"生成"区和收件箱） |
| 成片卡 | 视频播放器、时长、下载按钮 | 这里带漫画点缀（§7.6） |
| 连线 | 角色 → 分镜网格 → 成片 | 只读 |

卡片状态只用一个 8px 的状态点，再加 `aria-label` 文本，取值如下：

- **生成中**：info 色，带脉冲动画；减少动态效果模式下不脉冲。
- **待确认**：warning 色。**只有当前运行有一个审批门、并且这个门覆盖该卡片所在阶段时，才显示这个状态。**
- **已确认**：success 色。
- **需重合成**：warning 色。
- **阻塞 / 失败**：error 色。
- **未确认**：中性色，不做任何提示。这个规则修复审计 F4：已出成片的项目里，卡片上还挂着"待审阅 + 通过 / 重做"。

### 5.3 活动时间线（替代聊天）

- 每一条是一个**步骤**，包括：阶段名、状态图标、耗时，以及可展开的子项（工具调用、产出的 artifact 链接）。
- agent 的说明文字作为步骤的正文，用普通段落显示，**不用对话气泡**（删除 speech-bubble CSS，`TypewriterText` 也一并删除）。
- 流式更新时自动跟随到最新；用户向上滚动后停止跟随，并显示"跳到最新"按钮。
- 数据来源不变：仍然是现有的 message feed（TanStack Query）加 WebSocket 事件。

### 5.4 PromptBar 与选区上下文

- **上下文 chip**：
  - 显示当前选区，例如 `[分镜 S01 ×] [角色 小猫 ×]`；
  - 没有选区时显示 `[整个项目]`；
  - 处于"提修改意见"状态时显示 `[故事大纲 · 待确认 ×]`；
  - chip 可以单独移除。移除选区 chip 等于取消该对象的选中，以画布选区为准。
- **按键**：Enter 发送，Shift+Enter 换行。
- **占位文字随上下文变化**：
  - 有选区时："描述如何调整所选内容…"
  - 处于审批状态时："说明需要修改的地方…"
  - 空闲时："描述你想生成的内容…"
- **运行模式开关**放在 PromptBar 左侧，两个选项：`逐步确认 / 自动确认`。
  - "YOLO 模式"改名为"自动确认"，因为界面只用中文，并且要降低术语门槛。
  - 运行中切换到"自动确认"会自动通过当前的审批门，沿用现有语义。
- **发送行为**沿用现有接口，不改：
  - 有选区时，调用反馈接口，带上 `entity_type` 和 `entity_ids`；
  - 处于审批门时，调用反馈接口，带上 `run_id`。

### 5.5 Inspector 分区

| 分区 | 内容 |
|---|---|
| 概览（原「选区」） | 头部没写的字段：状态等，不重复名称；多选时显示数量和共同状态 |
| 属性 | 可编辑字段，即原"内容"tab |
| 生成 | 提示词、重做、补帧，以及单项"确认"（原来在卡片上的 通过 / 重做） |
| 历史 | 最近版本列表、"对比"（打开 VersionCompareDrawer）、"查看全部"（打开 HistoryDrawer） |

`WorkflowInspector.tsx`（1015 行）按这四个分区拆成 4 个文件，每个不超过 300 行。

## 6. 运行状态与审批

### 6.1 唯一真相：`deriveStudioStatus`

这个函数在现有 `deriveWorkbenchStatus` 的基础上扩展，返回值如下：

```ts
type StudioStatus = {
  state: "idle" | "generating" | "awaitingConfirm" | "recoverable" | "cancelled"
       | "ready" | "superseded" | "failed" | "blocked";
  label: string;            // 中文文案，唯一来源
  tone: "neutral" | "info" | "warning" | "success" | "error";
  stage: string | null;     // 仅 generating / awaitingConfirm / recoverable 时有值
  progress: number | null;  // 仅 generating 时有值；其他状态一律为 null，不显示进度条
  pendingCount: number;     // 待处理收件箱的条目数
};
```

**消费方**（必须全部从这里取值，禁止自己推导）：

- TopBar 状态胶囊；
- Agent 面板标题；
- 项目列表的状态徽标（列表页没有运行信息时，退化为按 `project.status` 推导）；
- 移动端头部；
- 页面标题前缀，例如 `（待确认）项目名`。

**规则**：

1. 运行**不处于活跃状态**时，不渲染任何进度条或阶段高亮。这修复审计 F4：状态写着"成片可用"，进度条却停在 8%。
2. 优先级：`awaitingConfirm` > `recoverable` > `generating` > `failed` > `blocked` > `superseded` > `ready` > `cancelled` > `idle`。
3. 状态切换时，通过 `aria-live="polite"` 区域播报 `label`。

### 6.2 待处理收件箱（审批只在这一处）

条目类型：

| 类型 | 触发条件 | 卡片内容 | 操作 |
|---|---|---|---|
| 阶段审批门 | 运行处于 `waiting_for_approval` | 阶段名，加产出预览（大纲、角色或分镜的缩略） | **确认继续**；**提修改意见**（把审批门 chip 放进 PromptBar 并聚焦输入框） |
| 可恢复运行 | `RecoveryControlRead.state = recoverable` | 中断阶段、已完成产物的数量 | 继续 / 取消 |
| 阻塞项 | blocking clips | 被阻塞的分镜列表（点击即在画布上选中该分镜） | 跳转 |
| 失败 | 最近一次运行失败 | 错误摘要（统一的 ApiError 文案） | 从失败阶段重试 |

- **单一入口**："确认 / 继续 / 重试"按钮**只存在于收件箱卡片里**。
  - TopBar 状态胶囊只负责导航：点击后打开并聚焦收件箱。
  - 主操作按钮（生成 / 停止）不承担审批。
  - 原来散落在三处的审批入口（`ProjectWorkbench.tsx:353/428/453`）全部收敛到这里。
- 审批门的数据**由前端从现有接口推导**：`GET /projects/{id}/runs/current` 加 `run_awaiting_confirm` 事件，再加 messages。
  - 现在刷新页面后已经能恢复审批门（审计时实测确认）。
  - **预期后端零改动**。如果实现时发现刷新后会丢失 gate 信息，允许给 `RecoveryControlRead` 增加一个可选字段 `pending_gate: {stage, title} | null`，只追加字段，不改已有字段。

## 7. 视觉系统

`tokens.css` 依然是 SSOT（ADR 0002 不变）。改 token 时，`DESIGN.md` 的 front-matter 在同一个 PR 里同步更新。

### 7.1 主题

- **亮色、暗色两套都保留**。暗色实现现在已经可用，保留它的成本很低。
- `data-theme` 的取值改为 `light` / `dark`，弃用 `doodle` / `doodle-dark`。
- 首次访问时跟随系统的 `prefers-color-scheme`；用户手动切换后写入 localStorage。
- 每个颜色 token 都必须**在两套主题下都通过** `themeContrast.test.ts`。

### 7.2 颜色

**品牌主色：印版品红**。选它的理由：

- 来自现有 CMYK 印刷隐喻里的 M 版，延续了品牌；
- 与 error 红在色相上明显区分（约 330° 对 0°）；
- 避开了"AI 紫色渐变"和"灰色 SaaS"这两种常见外观。

金色彻底弃用：作为文字时对比度只有 1.8:1（审计 F6）。

| Token | 亮色 | 暗色 | 用途 | 对比度（实测） |
|---|---|---|---|---|
| `--primary` | `#B0215F` | `#F27AAE` | 主按钮填充、焦点环、选中描边、链接 | 作为文字时：亮色在 bg 上 6.06:1；暗色在 bg 上 7.27:1 |
| `--primary-fg` | `#FFFFFF` | `#121216` | 主色按钮上的文字 | 6.5:1 / 7.27:1 |
| `--bg` | `#F7F7F4` | `#121216` | 画布、页面底 | – |
| `--surface` | `#FFFFFF` | `#1B1B21` | 浮层面板、卡片 | – |
| `--sunken` | `#EFEEE9` | `#24242C` | 输入框、分区底 | – |
| `--border` | `#DEDDD6` | `#33333D` | 1px 分隔线（装饰性） | – |
| `--border-strong` | `#8A8A94` | `#6E6E7A` | 输入框和复选框的边界、未选中的控件轮廓（WCAG 1.4.11） | 在 surface 上 3.42:1 / 3.41:1；在 bg 上 3.18:1 / 3.71:1 |
| `--ink` | `#1C1C22` | `#ECECF1` | 正文 | 15.8:1 / 15.9:1 |
| `--ink-muted` | `#5B5B66` | `#A3A3AF` | 次要文字、placeholder | 在 bg 上 6.2:1 / 7.5:1；在 sunken 上 5.8:1 / 6.2:1 |
| `--success-fg` / `--success-bg` | `#1F7A4D` / 10% 透明度 | `#6FD3A0` / 15% | 状态文字 / 状态底 | 4.95:1 / 10.2:1 |
| `--warning-fg` / `--warning-bg` | `#9A5B00` | `#F2B35A` | 同上 | 5.06:1 / 10.1:1 |
| `--error-fg` / `--error-bg` | `#B42318` | `#FF8A80` | 同上 | 6.13:1 / 8.19:1 |
| `--info-fg` / `--info-bg` | `#0B6E7F` | `#5FCFE0` | 同上 | 5.51:1 / 10.2:1 |

规则：

- 状态色**只能用 `*-fg` 作为文字色**。饱和的状态色只用于状态点和细描边。
- 禁止使用 Tailwind 默认的 gray 色阶（Warm Neutral 规则保留）。
- 删除 `secondary`（品红按钮）和 `accent`（青色按钮）这两个按钮变体。青色只作为 `info` 和 CMYK 点缀继续存在。

### 7.3 字体（中文优先）

**方案：使用系统 CJK 字体栈，不打包任何中文 webfont。** 理由：

- 中文 webfont 动辄数 MB，即使按 unicode-range 分片也要几百 KB 起；
- 主流系统自带的苹方、微软雅黑、Noto Sans CJK 质量足够；
- 自托管场景不应依赖字体 CDN。

```css
--font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB",
  "Microsoft YaHei UI", "Microsoft YaHei", "Noto Sans CJK SC", "Source Han Sans SC",
  "Noto Sans SC", system-ui, sans-serif;
--font-mono: ui-monospace, "SF Mono", Menlo, Consolas, "Noto Sans Mono CJK SC", monospace;
--font-brand: "Bangers", var(--font-sans);   /* 只用于字标与 §7.6 点缀 */
```

- 删除 Fredoka、Nunito、Caveat 这三个 `@fontsource` 包，只保留 Bangers（拉丁子集，约 30KB）。
- 中文不使用大写字母间距，不使用斜体（`letter-spacing: 0`）。
- `font-mono` 只用于编号（S01）、时长、技术字段，不用于中文标签。

### 7.4 字号（最小 12px）

| Token | px | 行高 | 用途 |
|---|---|---|---|
| `--text-xs` | 12 | 1.5 | **下限**：元信息、徽标、卡片编号 |
| `--text-sm` | 13 | 1.5 | 密集界面：面板、列表 |
| `--text-base` | 14 | 1.6 | 正文、输入 |
| `--text-md` | 16 | 1.5 | 卡片标题、Dialog 正文 |
| `--text-lg` | 18 | 1.4 | 面板标题 |
| `--text-xl` | 20 | 1.35 | 页面标题 |
| `--text-2xl` | 24 | 1.3 | 首页主标题 |

**删除 `--text-2xs`（10px）**，目前有 140 处使用（审计 F7）。画布卡片的文字按屏幕像素算也不得小于 12px，由默认缩放下限保证（§5.1.2）。

### 7.5 形状、阴影、层级、动效

- **圆角**：控件 6px，卡片和面板 10px，胶囊 999px。弃用全 0px 的硬角风格。
- **阴影**：
  - 平面元素：只用 1px border；
  - 浮层面板：`0 4px 16px rgb(0 0 0 / .08)`，暗色主题改用 border 加 `.4` 透明度；
  - Dialog：再加一级。
  - **CMYK 偏移硬阴影只出现在 §7.6 规定的位置。**
- **Z 轴**，一套刻度，全部写成 token：

  | 层 | 值 |
  |---|---|
  | 画布 | 0 |
  | 画布工具条、浮层面板 | `--z-panel` 20 |
  | 下拉、菜单 | `--z-popover` 40 |
  | Toast | `--z-toast` 60 |
  | Tooltip | `--z-tooltip` 70 |

  Dialog 和 Drawer 使用原生 `<dialog>.showModal()`，进入浏览器的 **top layer**，**不参与 z-index**。删除 `--z-corner` 这一类特例（审计 F1 的根因）。
- **动效**：150 / 200 / 300ms 三档保留；面板展开和收起用 200ms ease-out；遵守 `prefers-reduced-motion`。

### 7.6 漫画点缀：只允许出现在这些位置

1. **字标** `OPENOII`（Bangers）。
2. **成片卡**：2px ink 描边，加 CMYK 双色偏移阴影（`--cmyk-cyan` 和 `--cmyk-magenta` 各偏移 3px）。
3. **成片完成的时刻**：成片卡上出现一次网点（halftone）展开动画，在减少动态效果模式下不播放。
4. **空状态插画**：使用网点底纹。

除此之外不允许出现 offset 硬阴影、网点或对话气泡。检测口径：Impeccable 的 `hard-offset-shadow` 每页不超过 3 处。

### 7.7 图标

- 继续使用 `@heroicons/react`，已经安装，不更换图标库，避免无谓的改动。
- 只用描边风格，尺寸 16 或 20。
- 只有图标的按钮必须带 `aria-label`，由 TypeScript 类型强制。

## 8. 组件原语（每类需求只保留一个）

| 原语 | 实现 | 取代 |
|---|---|---|
| **Dialog** | `ui/Dialog.tsx`：原生 `<dialog>` 加 `showModal()`，提供 `variant: "center" \| "sheet-right" \| "sheet-bottom"`。浏览器原生提供 top layer、背景 inert、Esc 关闭和焦点圈定；组件只补"关闭后焦点回到触发元素"、滚动锁定和标题关联（`aria-labelledby`） | `Modal`、`ConfirmModal`、`PreviewModals`、`SettingsModal` 外壳、`useDialogFocus.ts`（120 行） |
| **Drawer** | 就是 `Dialog variant="sheet-right"`（移动端用 `sheet-bottom`） | `AssetDrawer`、`HistoryDrawer`、`VersionCompareDrawer` 各自的外壳 |
| **Button** | `ui/Button.tsx`：variant 为 `primary \| secondary \| ghost \| danger`，size 为 `sm(32) \| md(36) \| lg(44)`，另有 `IconButton`（必填 `aria-label`）；在粗指针设备上自动保证 44px | 59 处原生 `<button>` |
| **Input / Select** | 保留现有 `ui/Input`、`ui/Select`，统一换成新 token；Textarea 沿用 Input 的样式 | – |
| **Toast** | 保留现有实现 | – |

- **不引入 Radix。** 原生 `<dialog>` 已经解决了焦点圈定、inert、Esc 和置顶这几件事，符合"不加不必要依赖"。
- **退路**：如果在 jsdom 测试或目标浏览器上遇到无法绕过的问题，只引入 `@radix-ui/react-dialog` 一个包，API 保持一致。
- 测试注意：jsdom 不实现 `showModal`，需要在 `setupTests.ts` 里加 10 行左右的 polyfill。

## 9. 移动端（宽度 <1024px）：只做查看、审批和下载

单列布局，从上到下：

1. TopBar（紧凑）；
2. **状态头**：来自 `deriveStudioStatus`；
3. **待处理卡片**：确认继续、提修改意见（展开一个 textarea，发送后调用同一个反馈接口）、继续 / 取消；
4. **成片**：播放器加"下载"按钮；
5. **分镜网格**：只读缩略图，点开后全屏预览，可下载单张或单段；
6. **角色**：只读；
7. **最近活动**：最近 5 条，只读。

- 不渲染画布、Inspector 和 PromptBar。
- 所有可点击目标至少 44px（审计：项目列表的复选框只有 13×13）。
- 弹窗统一使用 `sheet-bottom`，属于 top layer，修复移动端遮罩被底部 tab 盖住的问题。

## 10. 删除清单

| 删除 | 行数或体积 | 阶段 |
|---|---|---|
| 一致性雷达 `components/panels/ConsistencyPanel.tsx` 及入口，加上 `recharts` 依赖 | 434 行；113 KB gzip | P0 |
| 创作访谈：`components/chat/CreationInterviewPanel.tsx`、`utils/creationInterview.ts`、工作台中的访谈分支、`api.ts` 中的访谈调用，以及后端 `POST /api/v1/text/interview/next` 和对应 schema | 约 374 行前端代码，加后端路由 | P0 |
| `components/home/SkillWall.tsx`、`features/skills/skillCatalog.ts`（死代码） | 283 行 | P0 |
| `@fontsource/caveat`、`font-sketch`；随后 `@fontsource/fredoka`、`@fontsource/nunito` | 3 个依赖 | P0 / P1 |
| `useDialogFocus.ts`，以及各弹窗、抽屉自带的遮罩和焦点逻辑 | 约 120 行起 | P0 |
| `--text-2xs`、`--z-corner`、`secondary` / `accent` 按钮变体、`shadow-brutal*`（§7.6 之外的用法） | token | P1 |
| `StagePipeline.tsx` 整行、`StageView.tsx` | 350 行 | P2 |
| `WorkspaceSidebar.tsx`、`ChatPanel` 的气泡样式、`TypewriterText.tsx`、`.speech-bubble*` CSS | 约 700 行 | P2 |
| 卡片上的"通过 / 重做"按钮 | – | P2 |
| **tldraw**：`syncTldrawProjection.ts`（588 行）、`WorkflowShapeUtils.tsx`（828 行）、`tldraw-vendor` chunk | 480 KB gzip JS，加 14 KB CSS | P3 |

## 11. 可访问性目标（WCAG 2.2 AA）

1. 文字对比度不低于 4.5:1，非文本 UI 不低于 3:1，两套主题都要达标，由 `themeContrast.test.ts` 强制。
2. 字号不低于 12px。Impeccable 的 `undersized-ui-text` 计数为 **0**。
3. 点击目标不小于 24×24（2.5.8）；主要操作和粗指针设备上不小于 44×44。
4. 全部弹窗使用原生模态 `<dialog>`，并通过 `aria-labelledby` 关联标题；关闭后焦点回到触发元素。
5. 画布节点可以用 Tab 聚焦、Enter 选中、Esc 取消（React Flow 内置）；每张卡片都有 `aria-label`，例如"分镜 S01，已确认"。
6. 状态变化和新增待处理事项通过 `aria-live` 播报。
7. 保持现有的 landmark 结构（header / nav / main / aside），以及"跳到工作台"链接。
8. 遵守 `prefers-reduced-motion`。

## 12. 后端改动（最小）

| 改动 | 原因 | 阶段 |
|---|---|---|
| 删除 `POST /api/v1/text/interview/next` 及其 schema 和测试 | 创作访谈删除后没有调用方 | P0 |
| （可选）`RecoveryControlRead` 追加 `pending_gate` 字段 | 只在刷新后无法恢复审批门时才加 | P2 |
| **不动**：一致性评估接口和数据表 | 雷达只删前端。后端是否一并删除，待用户确认（会涉及迁移） | – |

## 13. 性能预算

以 `vite build` 产物为准，按 gzip 计算；由 `scripts/check-bundle-budget.mjs` 在 CI 中检查。

| 项 | 现状 | 预算 |
|---|---|---|
| `/`、`/projects` 首屏 JS | 约 85 KB | **≤ 120 KB** |
| `/project/:id` 全部 JS（含画布） | 约 600 KB（tldraw 480 KB） | **≤ 250 KB**（React Flow 57 KB） |
| 单个 chunk 上限 | 479 KB | **≤ 150 KB** |
| CSS 总量 | 48 KB（index 34 KB + tldraw 14 KB） | **≤ 25 KB** |
| Webfont | 4 个家族，35 个 woff2 | **只有 Bangers 拉丁子集** |
| 画布 100 张卡片 | – | 首次渲染 ≤ 500 ms；平移 ≥ 55 fps（spike 实测 330 ms / 60 fps） |

## 14. 审计发现与本 spec 的对应

| # | 审计发现 | 对应的解决方式 |
|---|---|---|
| F1 | P0：设置弹窗被 Inspector 盖住（`InspectorColumn.tsx:49/66` 用的是 z-corner 80，而 modal 是 50；全仓库没有 portal） | §8 原生 `<dialog>` 进入 top layer；删除 `--z-corner` |
| F2 | P0（部署时）：tldraw 在生产环境需要 key，开源下游用户需要各自申请 | §10 / P3 换成 React Flow |
| F3 | P1：默认缩放 59% / 44%，卡片文字只有约 6px | §5.1.2 设置可读缩放下限 |
| F4 | P1：状态矛盾（"成片可用"却显示 8%；高亮"规划"；"待审阅"；等待时显示"执行中"） | §6.1 SSOT 规则；§5.2 状态点规则 |
| F5 | P1：审批入口分散在 3 处 | §6.2 收件箱 |
| F6 | P1：金色文字 1.8:1，状态文字 2.0–2.3:1，placeholder 2.4:1 | §7.2 新主色和 `*-fg` token |
| F7 | P1：10px 字号用了 140 处 | §7.4 删除 `--text-2xs` |
| F8 | P1：活动栏默认折叠 | §5.1.3 Agent 面板默认展开 |
| – | P2：Comic 字体不覆盖中文；DESIGN.md 对双主题自相矛盾；13px 复选框 | §7.3；§7.1；§9 |

## 15. 验收标准

**整体（Phase 4 结束时）**

- Impeccable `audit` 总分 **≥ 17/20**，每个维度 **≥ 3**。
- Impeccable `critique` 的 Nielsen 评分 **≥ 30/40**，其中"系统状态可见"一项 ≥ 3。
- `npx impeccable detect` 实时扫描四个页面：`low-contrast` **0**、`undersized-ui-text` **0**、`hard-offset-shadow` 每页 **≤ 3**。

**按区域**

| 区域 | 验收方式 |
|---|---|
| Dialog / Drawer | 在 1440×900 的工作台打开设置，用 Playwright 对"保存"按钮中心点做 `elementFromPoint`，命中的必须是该按钮本身；Esc 关闭后焦点回到设置按钮。390×844 下同样验证 |
| 状态 SSOT | 单元测试：ready 项目加一个陈旧 run（progress 0.08），期望 `progress=null`、`stage=null`、label 为"成片可用"；`awaitingConfirm` 的优先级最高；每种状态各一个用例。另用 grep 守卫：除 `deriveStudioStatus` 外，任何组件不得直接读取 `run.progress` |
| 收件箱 | 组件测试：审批门出现时，界面上**只有一个**"确认继续"按钮（`getAllByRole('button',{name:'确认继续'})` 长度为 1）；"提修改意见"会让 PromptBar 出现审批门 chip 并获得焦点 |
| PromptBar | 组件测试：选中两张卡片后出现两个 chip，移除一个后选区同步更新；Enter 发送、Shift+Enter 换行 |
| 视觉 token | `themeContrast.test.ts` 覆盖 §7.2 的全部组合，两套主题都要通过；`designContract.test.ts` 断言不存在 `--text-2xs`、`--z-corner`，以及 `text-2xs`、`z-corner` 类名 |
| 画布 | Playwright：100 张卡片的种子项目在 1440 宽度下首次渲染，分镜卡标题在屏幕上 ≥ 12px（用 getBoundingClientRect 乘以缩放计算）；Tab 能聚焦到卡片，Enter 选中后 Inspector 显示对应对象；`toFlowNodes` 的纯函数单元测试 |
| 移动端 | Playwright 390×844：不存在画布 DOM；待处理卡可以完成确认；成片有下载链接；所有可点击目标 ≥ 44px（脚本扫描） |
| 性能 | `check-bundle-budget.mjs` 通过 §13 的全部预算 |
| 删除 | `package.json` 中不再有 `recharts`、`tldraw`、`@fontsource/caveat`、`@fontsource/fredoka`、`@fontsource/nunito`；`rg` 搜索不到 `ConsistencyPanel`、`CreationInterview`、`SkillWall`、`TypewriterText` |
