# 重设计后前端审计（Impeccable）

- 日期：2026-10-29（Asia/Shanghai），代码：dev + 本 PR
- 工具：Impeccable `detect`（实时页面，1440×900 / 1280×800 / 390×844）、`audit` 与 `critique`（Nielsen）方法论
- 页面：`/`、`/projects`、`/project/2`（6 个镜头）、`/project/5`（中断的运行）、`/universes`
- 基线：重设计前的审计（audit 11/20，Nielsen 21/40；low-contrast 11，undersized-ui-text 81，hard-offset-shadow 26）

## 1. Detect

| 规则 | 重设计前（1280） | 现在（三种视口合计） | 目标 |
|---|---|---|---|
| low-contrast | 11 | **0** | 0 |
| undersized-ui-text | 81 | **0** | 0 |
| hard-offset-shadow | 26（工作台 20） | **0** | 每页 ≤3 |
| text-occlusion（advisory） | – | 1440：11；1280：18；390：0 | – |

- 本 PR 修掉的最后几处：Tailwind preflight 的 `input::placeholder` 特异性压过了全局 placeholder 规则（灰 2.4:1）；
  React Flow 署名 10px `#999`（改为 11px `ink-muted`，署名保留）；活动时间线的时长在移动端用了 `ink-subtle`（3.7:1）。
- text-occlusion 全部是画布卡片滚到浮层（检查器、Agent 面板、工具条、PromptBar）下面，属于"全幅画布 + 浮层"布局的预期行为，
  不是固定 UI 互相遮挡。
- 暗色主题没有做实时扫描（detector 不切主题），由 `themeContrast.test.ts` 在 token 层覆盖。

## 2. Audit（每项 0–4）

| 维度 | 前 | 后 | 依据 |
|---|---|---|---|
| 可访问性 | 2 | **3** | 对比和字号 detector 全零；原生 `<dialog>` 进 top layer，设置弹窗不再被检查器盖住；landmark 与跳转链接保留。扣分：画布卡片只能靠指针排序，没有键盘排序 |
| 性能 | 2 | **4** | tldraw（gzip 480KB）和 recharts 已移除；首屏 gzip 约 225KB，最大 chunk 73KB；`pnpm build` 内置预算（总 ≤250KB、单 chunk ≤150KB） |
| 主题化 | 3 | **4** | tokens.css 单一来源，两套主题对比度有测试；废弃 token 由契约测试拦截；DESIGN.md 与实现一致（本 PR） |
| 响应式 | 2 | **3** | 手机单列视图（状态、待处理、预览、最近动态）有 390×844 e2e；1280 下两侧面板互斥。扣分：1280–1440 时画板的一部分会落在打开的面板下面 |
| 实现完整性 | 2 | **3** | 一个 Dialog、一个审批入口（待处理）、一个文本入口（PromptBar）；WorkflowInspector 从 1015 行降到 125 行。扣分：SettingsModal 仍有 1072 行 |
| **总分** | 11 | **17 / 20** | 目标 ≥17 且每项 ≥3：**达标** |

## 3. Critique（Nielsen 十项，每项 0–4）

| # | 启发式 | 前 | 后 | 说明 |
|---|---|---|---|---|
| 1 | 系统状态可见 | 1 | **3** | 状态胶囊（阶段、进度、耗时）+ 活动时间线 + 待处理角标 |
| 2 | 贴合现实 | 2 | 3 | 分镜、角色、首帧等创作者词汇 |
| 3 | 用户控制 | 3 | 3 | 停止、取消、面板收起、重置布局；画布编辑没有撤销 |
| 4 | 一致性 | 2 | 3 | 统一 Button/IconButton/Dialog；审批按钮只出现在一处 |
| 5 | 防错 | 2 | 3 | 默认逐步确认，审批门 |
| 6 | 识别而非回忆 | 2 | 3 | PromptBar 上下文 chip；窄于 1400 工具条只剩图标 |
| 7 | 灵活高效 | 3 | 3 | 多选、框选、Enter 发送、自动确认 |
| 8 | 极简美观 | 2 | 3 | 安静的中性色，漫画元素收敛到 §7.6 |
| 9 | 错误恢复 | 3 | 3 | 待处理里"从失败阶段重试" |
| 10 | 帮助文档 | 1 | 2 | 只有占位文字和空状态，没有首次引导 |
| | **总分** | 21 | **29 / 40** | 目标 ≥30：**差 1 分未达标**；"系统状态可见" ≥3：达标 |

## 4. 剩余问题

1. [P2] 面板在适配视图之后才打开时（例如有待处理项自动展开 Agent 面板），画板左侧会落在面板下面，需要再点一次"适配"。
2. [P2] 没有首次使用引导（Nielsen #10）。
3. [P3] SettingsModal 1072 行，应拆分。
4. [P3] 镜头排序没有键盘方式。
