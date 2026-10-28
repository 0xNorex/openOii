# 画布技术评估（2026-10）

> 结论：**用 React Flow（`@xyflow/react` 12，MIT）替换 tldraw**。替换放在独立阶段，挂在现有 `buildComicWorkflow` / `layoutComicWorkflow` 数据模型之后，数据模型不变。
> 决策记录：ADR 0010。实施计划：`docs/specs/frontend-studio-redesign-plan.md` 的 Phase 3。

## 1. 需求

openOii 的画布是一块**结构化、但允许自由摆放的分镜板**：

- **节点**：角色卡、分镜卡（首帧图/视频/状态/动作）、成片卡（视频播放器）。卡片是普通 React 组件，里面有 `<img>`、`<video>` 和按钮。
- **结构**：分镜卡归在"分镜网格"分组里；角色 → 分镜 → 成片 之间有连线；有确定性的初始布局（`layoutComicWorkflow.ts`）；用户可以拖动；排序模式下"按位置重排分镜顺序"。
- **选区 → agent 上下文**：单选、多选都要即时投影到 PromptBar 的 chip 和 Inspector。
- **规模**：约 100 张媒体卡，平移和缩放要流畅。
- **移动端**：只读浏览（平移 / 缩放 / 点开预览），不编辑。
- **约束**：面向自托管的开源用户；React 18；KISS（依赖越少越好，不引入自研画布引擎）。

## 2. 候选对比

体积测量方法：用 esbuild 打 `--minify --format=esm` 产物，React 设为 external，统计 gzip -9 后的大小。一次性 spike，代码在 `/workspace/spikes/canvas`，不进仓库。

| 方案 | 许可证 | gzip 体积 | 维护情况（2026-10） | React 18 | 卡片 = React DOM | 选区 API | 可访问性 | 移动只读 | 适配度 |
|---|---|---|---|---|---|---|---|---|---|
| **tldraw** 5.6（仓库现用 ^4.3） | tldraw license（非 OSI） | **599 KB**（仓库内 v4 实测 480 KB） | ★51k，每周发版 | ✅ | ✅（ShapeUtil） | ✅ | 一般 | 一般 | 能力过剩，**许可证不可接受**（见 §3） |
| **React Flow** `@xyflow/react` 12.12 | **MIT** | **57 KB** | ★38.8k，月更（12.12.0 发布于 2026-09-24） | ✅（peer ≥17） | ✅（自定义 nodeTypes） | ✅ `useOnSelectionChange` | ✅ 节点可 Tab 聚焦、Enter 选中、方向键移动、有 aria-live 区域 | ✅ 有触摸手势，可关闭拖拽 | **最佳** |
| Excalidraw 0.18 | MIT | 约 369 KB（静态依赖闭包；全部 chunk 约 2.4 MB） | ★134k，但 npm 发版稀少（0.18.0 → 0.18.1 隔了 13 个月） | ✅ | ❌ 元素是手绘矢量，自定义卡片只能用 iframe embeddable | 有 | 弱（canvas 渲染） | 一般 | 白板产品，不是节点画布 |
| Konva + react-konva | MIT | 90 KB | ★14.9k，活跃 | ⚠️ react-konva 19.x 要求 React 19，只能停在 18.2 线 | ❌ canvas 绘制，视频和按钮要自己画 | 自己实现 | ❌ 无 DOM 语义 | 一般 | 低 |
| Fabric.js 7 | MIT | 85 KB | ★31.5k，活跃 | 无 React 绑定（命令式） | ❌ | 自己实现 | ❌ | 一般 | 低 |
| 自研 DOM 画板（`panzoom` / `@use-gesture`） | MIT | 6–8 KB | panzoom 维护缓慢；use-gesture 上次发版在 2024-03 | ✅ | ✅ | **全部自研**（框选、多选、拖拽、连线、裁剪、键盘） | 自研 | 自研 | 体积最小，但自研代码量最大，**不符合 KISS** |

## 3. tldraw 许可证（来自官方文档，2026-10-28 核对）

来源：<https://tldraw.dev/community/license>、<https://tldraw.dev/sdk-features/license-key>

- 默认条款**只允许在开发环境使用**。生产环境（HTTPS、非 loopback 域名、`NODE_ENV=production`）没有有效 key 时，SDK 会在 **5 秒后停止渲染编辑器**。
- key **绑定域名**。每个部署到自己 HTTPS 域名的自托管用户，都需要**各自申请** key。
- Hobby（非商业）许可证是"**酌情发放**"的：要逐个审核、**必须显示 "made with tldraw" 水印**，并且会上报 license ID、SDK 版本和页面 URL。
- 官方原文："If you wish to include tldraw in an open source project … you and your downstream users will require their own trial, commercial, or hobby license in order to use the SDK in production."

对 openOii（自托管开源）的含义：每个通过 HTTPS 域名部署的用户都要自己去申请 key，否则画布会白屏；拿到 hobby key 也带水印和遥测。这和"开箱即用的开源自托管"直接冲突。仅这一点就足以替换 tldraw。

## 4. React Flow 关键 API 的 spike 结果

spike 规模：108 个自定义媒体节点（1 个分组 + 100 张分镜卡 + 8 张角色卡 + 1 张成片卡），再加连线。

**体积**

- React Flow 本身 57 KB gzip；连同 React 18 整包 103 KB gzip。
- 对比：仓库现有 `tldraw-vendor` 为 480 KB gzip，单页可省约 **420 KB gzip**。

**性能**（Playwright headless Chromium，1440×900）

- 挂载到 `fitView` 完成约 **330 ms**，首次渲染 110 个节点。
- 开启 `onlyRenderVisibleElements` 后，放大时 DOM 中只保留 10 个可见节点（视口裁剪生效）。
- 平移过程中 rAF 稳定在 **60 fps**。

**选区**

- 点击可选中；`useOnSelectionChange` 同步回调出选中的节点 id。
- 多选键是 `multiSelectionKeyCode`，默认 Meta/Ctrl；默认 Shift 用于框选，可以配置。

**可访问性**

- 节点自带 `tabindex=0`、`role=group`、`aria-roledescription=node`。
- 键盘聚焦后按 Enter 选中，方向键移动 5px；内置 `aria-live` 播报区。

**移动只读**

- `nodesDraggable=false`、`elementsSelectable=false`、`nodesConnectable=false` 即可变成只读，保留平移和缩放。

**分组 / 排序**

- 用 `parentId` 加 `extent:"parent"` 实现分镜网格分组。
- 排序模式沿用现有思路：`onNodeDragStop` 按位置计算新顺序，再调用 `PATCH /shots/reorder`。

## 5. 推荐与边界

1. **采用 React Flow**，替换 tldraw。只用 MIT 核心包，**不买 React Flow Pro**。右下角 attribution 可以通过 `proOptions.hideAttribution` 隐藏（MIT 允许），但默认保留，以示对上游的支持。
2. 画布仍由 `buildComicWorkflow` → `layoutComicWorkflow` 产出节点和坐标，React Flow 只负责**渲染和交互**。`syncTldrawProjection.ts`（588 行）整个删除，改为纯函数 `toFlowNodes(graph, layout)`。
3. 用户拖动后的位置照旧存在 localStorage（与现在 `persistenceKey` 的语义一致），不进后端。
4. **不做**：自由绘图、手绘笔、便签、任意形状。这些是 tldraw / Excalidraw 的强项，但不是 openOii 的需求。
