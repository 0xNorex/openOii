# 前端 Studio 重设计：实施计划

- Spec：`docs/specs/frontend-studio-redesign.md`
- ADR：0010
- 规则：每个 PR 都要**小、能独立合并、合并后应用照常可用**。
- 每个 PR 必须通过 CI：`tsc --noEmit`、`vitest`、`vite build`；涉及后端的 PR 还要通过 `ruff` 和 `pytest`。
- 规模估计按新增与删除行数之和计：**S** < 300，**M** 300–800，**L** 800–1500。L 级 PR 在实施时可以再拆。
- 阶段顺序：P0 先修 bug 和做删除 → P1 视觉基础 → P2 Studio 外壳（画布仍是 tldraw）→ P3 换画布 → P4 移动端与收尾。

---

## Phase 0：快速修复与删除（视觉保持现状）

### PR 0.1 `fix(frontend): render dialogs in the browser top layer`（M）

- **范围**
  - 新增 `ui/Dialog.tsx`：基于原生 `<dialog>.showModal()`，提供 `center` / `sheet-right` / `sheet-bottom` 三种 variant，负责焦点归还、滚动锁定和 `aria-labelledby`。
  - 用它迁移 `Modal`、`ConfirmModal` 和 `SettingsModal` 的外壳。
- **涉及文件**
  - `components/ui/Dialog.tsx`（新增）
  - `components/ui/Modal.tsx`、`ConfirmModal.tsx`
  - `components/settings/SettingsModal.tsx`（只改外壳）
  - `setupTests.ts`（加 `showModal` polyfill）
- **删除**：上述组件各自的遮罩和 z-index 写法；`useDialogFocus.ts` 中已经没有调用方的部分。
- **测试**
  - Dialog 单元测试：打开、Esc 关闭、焦点归还。
  - 新增 e2e `dialog-layering.spec.ts`：在 1440×900 的工作台打开设置，对"保存"按钮中心点做 `elementFromPoint`，命中的必须是按钮本身；390×844 下同样验证。
- **验收**：审计 F1 的截图场景复测通过。

### PR 0.2 `refactor(frontend): move drawers and previews onto the shared dialog`（M）

- **范围**：`AssetDrawer`、`HistoryDrawer`、`VersionCompareDrawer` 改用 `Dialog variant="sheet-right"`；`PreviewModals` 改用 `center`。
- **删除**：`useDialogFocus.ts` 整个文件；`--z-corner` 和 `z-corner` 类名，Inspector 改用 `z-panel`。
- **测试**：现有各 drawer 的测试继续通过；`designContract.test.ts` 断言 `z-corner` 已不存在。
- **验收**：全仓库 `rg 'role="dialog"'` 只在 `Dialog.tsx` 中出现。

### PR 0.3 `refactor(frontend): drop the consistency radar and recharts`（S）

- **范围**：删除 `components/panels/ConsistencyPanel.tsx`、StagePipeline 中的 `onOpenConsistency` 入口、`api.ts` 中的 `consistencyApi`、相关类型和 WebSocket 事件处理（`consistency_eval_completed` 改为忽略）。
- **删除**：依赖 `recharts`。
- **后端**：不动（待用户确认是否连后端一起删）。
- **测试**：删除相关测试；`pnpm build` 不再产出 `ConsistencyPanel` chunk。
- **验收**：构建产物减少约 113 KB gzip。

### PR 0.4 `refactor: remove the creation interview`（M）

- **前端**
  - 删除 `components/chat/CreationInterviewPanel.tsx`、`utils/creationInterview.ts`。
  - 删除 `ProjectWorkbench` 中的 `preflight` / `creationInterview` 分支。
  - 删除 `WorkspaceSidebar` 中访谈相关的部分、`api.ts` 中的 `/text/interview/next` 调用。
  - `HomePage` 的交互模式改为直接创建项目并启动运行，和 YOLO 模式走同一路径，区别只在 `auto_mode`。
- **后端**：删除 `routes/text.py` 中的 interview 路由，以及 `schemas/text.py` 中对应的 schema 和测试。
- **兼容**：旧项目的 `story` 里如果带有访谈标记，直接当作普通故事文本处理，不需要迁移。
- **测试**
  - 首页两种模式都能创建项目并跳转到工作台（vitest，mock api）。
  - 后端 `pytest` 通过。
- **验收**：`rg -i interview frontend/app backend/app` 没有结果（测试 fixture 除外）。

### PR 0.5 `chore(frontend): delete dead code and unused fonts`（S）

- **删除**
  - `components/home/SkillWall.tsx`、`features/skills/skillCatalog.ts`；
  - `@fontsource/caveat`；
  - `tailwind.config.ts` 中的 `sketch` 字体；
  - `styles/fonts.css` 中对应的 import。
- **测试**：构建通过；`rg SkillWall|skillCatalog|font-sketch` 没有结果。

### PR 0.6 `fix(frontend): one status truth for runs and cards`（M）

- **范围**
  - `deriveWorkbenchStatus` 重命名并扩展为 `deriveStudioStatus`，增加 `tone`、`stage`、`progress`、`pendingCount`，规则见 spec §6.1。
  - StagePipeline 和移动端预览改为只消费它：运行不活跃时，不显示进度条和阶段高亮。
  - `buildComicWorkflow` 的卡片状态规则：`draft` 只有在活跃审批门覆盖该阶段时才是 `review`（待确认），否则为中性的"未确认"；卡片上的"通过 / 重做"只在 `review` 状态下出现，到 P2 时彻底移走。
  - 活动栏标题读 `state`，等待审批时显示"待确认"，不再显示"执行中"。
- **涉及文件**：`features/comic-workflow/state/deriveWorkbenchStatus.ts`、`components/layout/StagePipeline.tsx`、`features/comic-workflow/graph/buildComicWorkflow.ts`、`features/comic-workflow/mobile/MobileWorkbenchPreview.tsx`、`features/workbench/ProjectWorkbench.tsx`。
- **测试**
  - 单元测试：ready 项目加一个陈旧 run（progress 0.08），期望 `progress=null`；状态优先级；无审批门时卡片为"未确认"。
  - grep 守卫测试：`run.progress` 只允许在 `deriveStudioStatus` 中被读取。
- **验收**：审计 F4 的三个场景（成片可用与 8%、高亮"规划"、等待时显示"执行中"）全部消失。

### PR 0.7 `fix(frontend): readable defaults on the workbench`（S）

- **范围**
  - 活动栏默认展开（`ProjectWorkbench.tsx:69` 改为 `useState(false)`），符合 ADR 0009 的现状契约；P2 会换成 Agent 面板。
  - tldraw 的 `zoomToFit` 改为"适配分镜区"，并设置屏幕字号 ≥12px 的缩放下限。这只是临时修复，P3 会被替换，代码量保持最小。
  - placeholder 颜色改用 `--ink-muted`，不再用 gray-400。
- **测试**：e2e `comic-workflow-canvas.spec.ts` 中加一条断言：卡片标题的屏幕字号 ≥ 12px。

---

## Phase 1：视觉基础（token、字体、原语）

### PR 1.1 `feat(tokens): studio palette, type scale and light/dark themes`（M）

- **范围**
  - `tokens.css` 按 spec §7.2、§7.4、§7.5 重写：引入印版品红主色、中性色、`*-fg` / `*-bg` 状态色、从 12px 起的字号、圆角、三级阴影，以及 `--z-panel` / `--z-popover` / `--z-toast`；删除 `--text-2xs`。
  - `data-theme` 取值改为 `light` / `dark`；`themeStore` 首次访问时跟随 `prefers-color-scheme`，并兼容迁移旧的 localStorage 值。
  - `tailwind.config.ts` 同步映射；全仓库把 `text-2xs` 替换为 `text-xs`（140 处，机械替换）。
  - 状态色当作文字的用法（`text-warning`、`text-success` 等）改为 `text-*-fg`。
  - **同一 PR** 更新 `DESIGN.md` 的 front-matter 和 §2–§4（ADR 0002）。
- **删除**：`secondary` / `accent` 按钮色、`--primary-ink`、`doodle` 主题名。
- **测试**
  - `themeContrast.test.ts` 扩展到 spec §7.2 的全部组合，两套主题都要通过。
  - `designContract.test.ts` 断言 `--text-2xs` 已不存在。
- **验收**：Impeccable 实时扫描 `low-contrast` 为 0、`undersized-ui-text` 为 0。

### PR 1.2 `feat(frontend): system CJK font stack, comic accents only where allowed`（M）

- **范围**
  - `font-sans`、`font-mono`、`font-brand` 按 spec §7.3 定义。
  - 删除 `@fontsource/fredoka`、`@fontsource/nunito`；`font-heading`（62 处）改为 `font-sans font-semibold`。
  - `shadow-brutal*`（41 处）和 halftone（10 处）只保留在字标、成片卡和空状态上，其余改为 border 或面板阴影；新增 `.comic-frame` 工具类。
- **测试**：`designContract.test.ts` 断言 `shadow-brutal` 只出现在白名单文件中。
- **验收**：实时扫描 `hard-offset-shadow` 每页 ≤ 3；构建产物中 woff2 只剩 Bangers。

### PR 1.3 `refactor(ui): one Button and IconButton`（M）

- **范围**
  - `ui/Button.tsx` 定义 variant 为 `primary/secondary/ghost/danger`、size 为 `sm/md/lg`；新增 `IconButton`，类型上要求必填 `aria-label`。
  - 59 处原生 `<button>` 改为使用它们；画布内部 tldraw 卡片中的按钮除外，P3 会被替换。
- **测试**：lint 守卫测试——在 `components/ui` 和 `features/comic-workflow/canvas` 之外，不允许出现原生 `<button`。

### PR 1.4 `style(frontend): restyle home, projects, universes and settings`（M）

- **范围**
  - 首页：输入框、模式选择（"YOLO 模式"改名为"自动确认"）、最近 3 个项目、3 条示例提示。
  - 项目列表：状态徽标取自 SSOT；批量删除改为"选择模式"；复选框点击区 ≥ 44px。
  - 宇宙页、设置页：只换样式，**字段不动**。
- **测试**：现有页面测试继续通过；e2e `smoke.spec.ts` 在 390×844 下扫描点击目标 ≥ 44px。

---

## Phase 2：Studio 外壳（画布仍是 tldraw）

### PR 2.1 `feat(studio): status pill and run actions in the top bar; drop the stage row`（M）

- **范围**：在 TopBar 中部加入状态胶囊（读 `deriveStudioStatus`，点击打开收件箱）和主操作（生成 / 停止）；增加 `aria-live` 状态播报区；页面标题前缀显示状态。
- **删除**：`StagePipeline.tsx`、`StageView.tsx`，以及 `--workbench-toolbar`。
- **测试**：TopBar 组件测试覆盖各种状态；e2e `workflow-stage-sync.spec.ts` 改为断言胶囊状态。

### PR 2.2 `feat(studio): floating agent panel with an activity timeline`（L，可拆为 2.2a 外壳 / 2.2b 时间线）

- **范围**
  - 画布改为全幅；`AgentPanel` 浮在左侧，宽 360px，默认展开，可以收成胶囊。
  - "活动"tab 是步骤时间线：阶段、工具、结果、耗时、可展开的子项，以及"跳到最新"。
  - 资产入口移到画布工具条（AssetDrawer）；宇宙时间线移到 Inspector 的"项目"视图。
- **删除**：`WorkspaceSidebar.tsx`、`ChatPanel` 的气泡、`MessageList` 的气泡样式、`TypewriterText.tsx`、`.speech-bubble*` CSS（Impeccable side-tab 误报随之消失），以及 `--workbench-activity*`。
- **测试**
  - 时间线由 message feed 推导的纯函数，要有单元测试。
  - 跟随与停止跟随的组件测试。
- **验收**：1440 宽度下画布可见区域 ≥ 视口面积的 80%（两侧面板收起时为 100%）。

### PR 2.3 `feat(studio): one approval inbox`（M）

- **范围**
  - "待处理"tab 支持四种条目：阶段审批门、可恢复运行、阻塞、失败，见 spec §6.2。
  - "确认继续 / 继续 / 取消 / 重试"按钮**只出现在这里**。
  - "提修改意见"让现有 PromptBar 获得焦点，PromptBar 已经支持审批时提交反馈；审批门 chip 的显示在 2.5 中补上。
  - 有新条目时自动展开并切换到该 tab。
- **删除**：TopBar 和 PromptBar 中原有的确认按钮；画布卡片上的"通过 / 重做"，迁到 Inspector。
- **后端**：预期零改动。如果刷新后无法恢复审批门，再给 `RecoveryControlRead` 追加可选字段 `pending_gate`，并配 pytest。
- **测试**：组件测试——审批门存在时，界面上的"确认继续"按钮恰好 1 个；`pendingCount` 与条目数一致。

### PR 2.4 `feat(studio): floating inspector with four sections`（L）

- **范围**
  - Inspector 浮在右侧，宽 320px。
  - `WorkflowInspector.tsx` 拆成四个文件：`SelectionSection`、`PropertiesSection`、`GenerationSection`、`HistorySection`，每个不超过 300 行。
  - 未选中任何对象时显示"项目"视图（Brief 加宇宙时间线）。
  - 视口宽度 <1280 时与 Agent 面板互斥展开。
  - 版本对比、全部历史通过 Drawer 打开。
- **删除**：`InspectorColumn.tsx` 的栏位布局，以及 `--workbench-inspector*`。
- **测试**：现有 `WorkflowInspector.test.tsx` 按分区拆分后继续通过；新增互斥展开的测试。

### PR 2.5 `feat(studio): floating prompt bar with selection chips`（M）

- **范围**
  - PromptBar 浮在底部居中，最大宽 720px。
  - 支持选区 chip、审批门 chip、`[整个项目]` chip；Enter 发送，Shift+Enter 换行。
  - 占位文字随上下文变化；左侧是"逐步确认 / 自动确认"开关。
  - 后端接口不变（反馈接口照常带 `entity_*` 和 `run_id`）。
- **测试**：多选产生两个 chip，移除一个后选区同步；审批门 chip 发送时带上 `run_id`。

---

## Phase 3：画布替换（tldraw → React Flow，基于现有数据模型）

### PR 3.1 `feat(canvas): React Flow renderer behind a local flag`（L）

- **范围**
  - 新增依赖 `@xyflow/react`。
  - 纯函数 `toFlowNodes(graph, layout)`：`buildComicWorkflow` 和 `layoutComicWorkflow` 保持不变。
  - 节点组件：`CharacterNode`、`ShotNode`、`OutputNode`（成片卡带 `.comic-frame`）、`ShotGridGroup`。
  - `useOnSelectionChange` 接到现有的 `onSelectedNodeIdChange` / `onSelectedNodeIdsChange`。
  - 默认 fitView 适配分镜网格，带可读下限，并按浮层面板留出 inset。
  - 用 `localStorage['openoii.canvas']==='flow'` 切换新画布。这是开发期开关，在 3.2 中删除。
- **测试**
  - `toFlowNodes` 单元测试（节点数、parentId、坐标）。
  - 选区桥接测试。
  - e2e：开启开关后能选中分镜，Inspector 同步显示。

### PR 3.2 `feat(canvas): parity and switch the default to React Flow`（M）

- **范围**
  - 排序模式：`onNodeDragStop` 按位置算出新顺序，调用 `PATCH /shots/reorder`。
  - 补帧、重置布局、用户位置持久化（localStorage，按项目区分）。
  - 键盘：Tab / Enter / Esc；每张卡片的 `aria-label`。
  - 画布工具条：缩放、适配、排序、补帧、资产。
  - 默认改用 React Flow，删除开发期开关。
- **测试**
  - 把现有 `comic-workflow-canvas.spec.ts` 迁到新画布。
  - 新增 100 张卡片的 e2e：首次渲染 ≤ 500 ms，卡片标题屏幕字号 ≥ 12px。

### PR 3.3 `chore(canvas): remove tldraw`（M，以删除为主）

- **删除**
  - `syncTldrawProjection.ts`（588 行）及其测试；
  - `canvas/shapes/WorkflowShapeUtils.tsx`（828 行）、`shapes/types.ts`；
  - `ComicWorkflowCanvas.tsx` 中 tldraw 相关的 bridge；
  - `vite.config.ts` 中的 `tldraw-vendor` 分包；
  - tldraw 的 CSS；
  - 依赖 `tldraw`。
- **新增**：`scripts/check-bundle-budget.mjs`，按 spec §13 的预算检查，并接入 `pr-ci.yml` 的前端构建步骤。
- **验收**：`/project/:id` 全部 JS ≤ 250 KB gzip；单个 chunk ≤ 150 KB gzip。

---

## Phase 4：移动端与收尾

### PR 4.1 `feat(mobile): view, approve and download`（M）

- **范围**
  - 用 `MobileStudio` 替换 `MobileWorkbenchPreview`，从上到下依次是：状态头、待处理卡片（含修改意见 textarea）、成片播放与下载、分镜缩略网格（点开预览并可下载）、角色、最近 5 条活动。
  - 弹窗使用 `sheet-bottom`。
- **测试**：e2e 390×844——不存在画布 DOM；可以完成一次审批；存在成片下载链接；所有点击目标 ≥ 44px。

### PR 4.2 `docs: finalize DESIGN.md and record the post-redesign audit`（S）

- **范围**
  - `DESIGN.md` 的 §1、§5、§6 按新系统改写，删除旧的四区布局示意图。
  - 重新运行 Impeccable 的 detect、audit 和 critique，把分数记录到 `docs/research/`。
- **验收**：audit 总分 ≥ 17/20、每个维度 ≥ 3；Nielsen ≥ 30/40；detector 的 `low-contrast` 和 `undersized-ui-text` 都为 0。

---

## 规模与顺序汇总

| # | PR 标题 | 规模 | 依赖 |
|---|---|---|---|
| 0.1 | fix(frontend): render dialogs in the browser top layer | M | – |
| 0.2 | refactor(frontend): move drawers and previews onto the shared dialog | M | 0.1 |
| 0.3 | refactor(frontend): drop the consistency radar and recharts | S | – |
| 0.4 | refactor: remove the creation interview | M | – |
| 0.5 | chore(frontend): delete dead code and unused fonts | S | – |
| 0.6 | fix(frontend): one status truth for runs and cards | M | – |
| 0.7 | fix(frontend): readable defaults on the workbench | S | – |
| 1.1 | feat(tokens): studio palette, type scale and light/dark themes | M | P0 |
| 1.2 | feat(frontend): system CJK font stack, comic accents only where allowed | M | 1.1 |
| 1.3 | refactor(ui): one Button and IconButton | M | 1.1 |
| 1.4 | style(frontend): restyle home, projects, universes and settings | M | 1.2, 1.3 |
| 2.1 | feat(studio): status pill and run actions in the top bar; drop the stage row | M | 0.6, 1.x |
| 2.2 | feat(studio): floating agent panel with an activity timeline | L | 2.1 |
| 2.3 | feat(studio): one approval inbox | M | 2.2 |
| 2.4 | feat(studio): floating inspector with four sections | L | 2.1 |
| 2.5 | feat(studio): floating prompt bar with selection chips | M | 2.3（审批门 chip） |
| 3.1 | feat(canvas): React Flow renderer behind a local flag | L | 2.4 |
| 3.2 | feat(canvas): parity and switch the default to React Flow | M | 3.1 |
| 3.3 | chore(canvas): remove tldraw | M | 3.2 |
| 4.1 | feat(mobile): view, approve and download | M | 2.3 |
| 4.2 | docs: finalize DESIGN.md and record the post-redesign audit | S | 全部 |

- P0 内部的 0.3、0.4、0.5、0.6、0.7 互不依赖，可以并行。
- 4.1 可以在 2.3 之后与 P3 并行进行。
