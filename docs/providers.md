# 模型服务商预设

设置页的「文本生成 / 图像服务 / 视频服务」三个页签顶部是服务商卡片。选一个预设，Base URL、接口路径和推荐模型会自动写进配置，只剩 API Key 需要自己填。地域和专属字段（如百炼业务空间 ID、Azure 资源名）在预设详情里单独填写，填完自动拼出地址。

- 预设数据：`frontend/app/components/settings/providerPresets.ts`，每个预设都带官方文档来源（`sources`），核对日期 **2026-10-30**（`PRESETS_VERIFIED_AT`）。
- 预设只是把值写进现有的配置键，后端和引擎没有新增 provider 类型。所有预设都落在已有的 `openai` / `anthropic` / `modelscope` / `doubao` / `fake` 五种类型上。
- 选预设**不会写入或清空密钥**。切换到另一家服务商后需要重新填写对应的 API Key。
- 「高级设置」保留所有原始字段（中文名为主，环境变量名作次要信息），可以逐项手动填写。手动改了地址后，卡片会自动回到「自定义」。
- 已有配置会按「provider 类型 + Base URL」反推回对应的预设。识别不出的（例如本机网关 `http://127.0.0.1:18790/v1`）显示为「自定义」，高级设置默认展开，原值不变。

## 测试连接

「测试连接」只发便宜的只读请求，超时 10 秒：

| 服务 | 请求 |
| --- | --- |
| 文本 | 沿用原来的一次极短文本请求（`probe_text_provider`） |
| 图像 / 视频（OpenAI 兼容、ModelScope） | `GET {API 根}/models`（Bearer）。返回 404/405 时提示「服务可达，但无法免费验证密钥」，不去生成图片或视频 |
| 视频（豆包 Seedance） | `GET https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks?page_size=1` |
| Fake | 直接成功 |

错误统一翻译成中文：

| 情况 | 提示 |
| --- | --- |
| 401 | API Key 无效（密钥填错、过期，或与地域不匹配） |
| 403 | 没有权限 |
| 404 | 地址不存在（检查是否漏了 `/v1`） |
| 429 | 请求太频繁或额度不足 |
| 5xx | 服务端错误 |
| 超时 | 连接超时 |
| 连不上 | 无法连接 |

本机或内网地址（localhost、127.0.0.1、内网 IP）只能在**保存后**测试，用来防止 SSRF。已保存的地址可以直接测。


## 文本生成（写入 `TEXT_*`（Claude 原生为 `ANTHROPIC_*`））

| 分组 | 预设 | 类型 | 地址 | 接口路径 | 推荐模型 | 特殊配置 / 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| 国内 | [DeepSeek](https://api-docs.deepseek.com/) | `openai` | 官方：`https://api.deepseek.com` | `/chat/completions` | `deepseek-flash`, `deepseek-v4-pro` | deepseek-chat / deepseek-reasoner 已于 2026-07-24 下线。 |
| 国内 | [阿里云百炼](https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope) | `openai` | 北京：`https://dashscope.aliyuncs.com/compatible-mode/v1`<br>新加坡：`https://dashscope-intl.aliyuncs.com/compatible-mode/v1`<br>北京 · 专属域名：`https://{workspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`<br>美国（弗吉尼亚）：`https://{workspaceId}.us-east-1.maas.aliyuncs.com/compatible-mode/v1`<br>日本（东京）：`https://{workspaceId}.ap-northeast-1.maas.aliyuncs.com/compatible-mode/v1` | `/chat/completions` | `qwen3.8-max`, `qwen3.7-plus` | 需要填写：workspaceId；地域和密钥不匹配时会返回 401 invalid_api_key。 |
| 国内 | [智谱 BigModel](https://docs.bigmodel.cn/cn/guide/develop/openai/introduction) | `openai` | 国内：`https://open.bigmodel.cn/api/paas/v4` | `/chat/completions` | `glm-5.3`, `glm-5.2`, `glm-5.3-flash` | temperature 取值 (0, 1)。 |
| 国内 | [Kimi（月之暗面）](https://platform.kimi.com/docs/api/overview) | `openai` | 国内：`https://api.moonshot.cn/v1`<br>海外：`https://api.moonshot.ai/v1` | `/chat/completions` | `kimi-k3` | K3 的推理强度对应高级设置里的「推理强度」：low / high 可用，max 引擎暂不支持。 |
| 国内 | [MiniMax](https://platform.minimax.io/docs/api-reference/text-openai-api) | `openai` | 国内：`https://api.minimaxi.com/v1`<br>海外：`https://api.minimax.io/v1` | `/chat/completions` | `MiniMax-M3`, `MiniMax-M3.1-Flash` | MiniMax-M2.5 / M2.7 将于 2026-11-18 下线。 |
| 国内 | [火山方舟](https://ark.volcengine.com/region:cn-beijing/docs/compatible-with-openai-sdk) | `openai` | 北京：`https://ark.cn-beijing.volces.com/api/v3` | `/chat/completions` | `doubao-seed-2-1-pro-260915` | — |
| 国内 | [百度千帆](https://cloud.baidu.com/doc/qianfan/s/Hmh4suq26) | `openai` | 国内：`https://qianfan.baidubce.com/v2` | `/chat/completions` | `ernie-4.5-turbo-128k`, `deepseek-v3.1-250821` | openOii 不发送 appid 请求头：请使用对全部应用有权限的 API Key。 |
| 国内 | [腾讯混元](https://cloud.tencent.com/document/product/1823/130051) | `openai` | 国内：`https://tokenhub.tencentmaas.com/v1`<br>国际：`https://tokenhub-intl.tencentcloudmaas.com/v1` | `/chat/completions` | `hy4-preview`, `hy3` | 旧地址 api.hunyuan.cloud.tencent.com 已于 2026-09-30 停用。 |
| 国内 | [硅基流动](https://docs.siliconflow.cn/) | `openai` | 国内：`https://api.siliconflow.cn/v1` | `/chat/completions` | `deepseek-ai/DeepSeek-V4.1-Flash`, `zai-org/GLM-5.3`, `tencent/Hy4-preview` | 官方已从 .com 迁移到 api.siliconflow.cn。 |
| 海外 | [OpenAI](https://developers.openai.com/api/reference/python/resources/chat/index.md) | `openai` | 官方：`https://api.openai.com/v1` | `/chat/completions` | `gpt-6-astra`, `gpt-6.1-terra`, `gpt-6.1-sol` | — |
| 海外 | [Anthropic Claude](https://platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk) | `openai` | 官方：`https://api.anthropic.com/v1` | `/chat/completions` | `claude-sonnet-5-5`, `claude-opus-5-5`, `claude-haiku-5-5` | 走 Anthropic 官方的 OpenAI 兼容层，Claude 5.5 系列可直接用；提示缓存、引用等原生特性不可用。；需要原生 Messages 接口或中转站时选「Anthropic 原生 / 中转」。 |
| 海外 | [Google Gemini](https://ai.google.dev/gemini-api/docs/openai) | `openai` | 官方：`https://generativelanguage.googleapis.com/v1beta/openai` | `/chat/completions` | `gemini-3.8-flash` | — |
| 海外 | [xAI Grok](https://docs.x.ai/developers/rest-api-reference/inference/chat-completions) | `openai` | 官方：`https://api.x.ai/v1` | `/chat/completions` | `grok-4.7`, `grok-4.6` | 推理模型响应较慢，可把高级设置里的请求超时调大。 |
| 海外 | [Mistral](https://docs.mistral.ai/api) | `openai` | 官方：`https://api.mistral.ai/v1` | `/chat/completions` | `mistral-large-4`, `mistral-medium-3-5` | — |
| 海外 | [OpenRouter](https://openrouter.ai/docs/quickstart) | `openai` | 官方：`https://openrouter.ai/api/v1` | `/chat/completions` | `openrouter/auto` | — |
| 海外 | [Groq](https://console.groq.com/docs/openai) | `openai` | 官方：`https://api.groq.com/openai/v1` | `/chat/completions` | `openai/gpt-oss-120b`, `openai/gpt-oss-20b` | — |
| 海外 | [Together AI](https://docs.together.ai/docs/openai-api-compatibility) | `openai` | 官方：`https://api.together.xyz/v1` | `/chat/completions` | `openai/gpt-oss-120b` | — |
| 海外 | [Azure OpenAI](https://learn.microsoft.com/azure/ai-foundry/openai/api-version-lifecycle) | `openai` | 资源终结点：`https://{resource}.openai.azure.com/openai/v1` | `/chat/completions` | — | 需要填写：resource；使用不带 api-version 的 v1 接口；旧的 /deployments/…?api-version= 地址请用自定义。 |
| 海外 | [Amazon Bedrock](https://docs.aws.amazon.com/bedrock/latest/userguide/inference-chat-completions.html) | `openai` | us-east-1：`https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1`<br>us-west-2：`https://bedrock-runtime.us-west-2.amazonaws.com/openai/v1` | `/chat/completions` | `openai.gpt-oss-120b-1:0`, `openai.gpt-oss-20b-1:0` | 只能用 Bedrock API Key（Bearer）；AWS SigV4 签名不支持。 |
| 本地与自定义 | [Ollama](https://docs.ollama.com/api/openai-compatibility) | `openai` | 本机：`http://localhost:11434/v1` | `/chat/completions` | — | localhost 指运行 openOii 后端的机器；本地地址需先保存再测试连接。 |
| 本地与自定义 | [LM Studio](https://lmstudio.ai/docs/developer/openai-compat) | `openai` | 本机：`http://localhost:1234/v1` | `/chat/completions` | — | localhost 指运行 openOii 后端的机器；本地地址需先保存再测试连接。 |
| 本地与自定义 | 自定义 OpenAI 兼容 | `openai` | — | — | — | 只切换类型，保留已有地址和模型 |
| 本地与自定义 | Anthropic 原生 / 中转 | `anthropic` | — | — | `claude-sonnet-4-5-20250929` | 只切换类型，保留已有地址和模型；引擎的原生 Claude 适配只认 4.x 型号；Claude 5.5 请用上面的「Anthropic Claude」。 |
| 本地与自定义 | Fake 本地测试 | `fake` | — | — | — | — |

## 图像服务（写入 `IMAGE_*`）

| 分组 | 预设 | 类型 | 地址 | 接口路径 | 推荐模型 | 特殊配置 / 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| 国内 | [火山方舟 Seedream](https://ark.volcengine.com/region:cn-beijing/docs/image-generation-api) | `openai` | 北京：`https://ark.cn-beijing.volces.com/api/v3` | `/images/generations` | `doubao-seedream-4-0-250828`, `doubao-seedream-5-0-pro-260628`, `doubao-seedream-5-0-flash-260915` | openOii 固定请求 1024×1024：5.0 lite 最低 2K，不在推荐列表里。；Seedream 默认加水印，openOii 目前不传 watermark 参数。 |
| 国内 | [智谱 CogView](https://docs.bigmodel.cn/cn/guide/models/image-generation/cogview-4) | `openai` | 国内：`https://open.bigmodel.cn/api/paas/v4` | `/images/generations` | `cogview-4-250304`, `cogview-4` | — |
| 国内 | [ModelScope 魔搭](https://modelscope.cn/docs/model-service/API-Inference/intro) | `modelscope` | 国内：`https://api-inference.modelscope.cn` | `/v1/images/generations` | `Tongyi-MAI/Z-Image-Turbo`, `Qwen/Qwen-Image` | 异步任务：提交后轮询 /v1/tasks/{id}，引擎和后端都已支持。 |
| 海外 | [OpenAI 图像](https://developers.openai.com/api/docs/guides/image-generation) | `openai` | 官方：`https://api.openai.com/v1` | `/images/generations` | `gpt-image-2.5-flare`, `gpt-image-2.5-sunburst` | — |
| 本地与自定义 | 自定义 OpenAI 兼容 | `openai` | — | — | — | 只切换类型，保留已有地址和模型 |
| 本地与自定义 | Fake 本地测试 | `fake` | — | — | — | — |

## 视频服务（写入 `VIDEO_*`（豆包为 `DOUBAO_*`））

| 分组 | 预设 | 类型 | 地址 | 接口路径 | 推荐模型 | 特殊配置 / 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| 国内 | [火山方舟 Seedance](https://ark.volcengine.com/region:cn-beijing/docs/list-video-generation-tasks-api) | `doubao` | — | — | `doubao-seedance-2-5-260628`, `doubao-seedance-1-5-pro-251215` | 固定使用北京地域；时长和画幅在高级设置里调整。 |
| 海外 | [xAI Grok Imagine](https://docs.x.ai/developers/model-capabilities/video/generation) | `openai` | 官方：`https://api.x.ai/v1` | `/videos/generations` | `grok-imagine-video-1.5`, `grok-imagine-video-1.5-lite` | **实验性**；返回 request_id 后轮询 /v1/videos/{id}，与 openOii 的异步任务流程一致。；xAI 的图生视频参数叫 image，openOii 发送的是 image_url：目前按文生视频使用。 |
| 本地与自定义 | 自定义 OpenAI 兼容 | `openai` | — | — | — | 只切换类型，保留已有地址和模型 |
| 本地与自定义 | Fake 本地测试 | `fake` | — | — | — | — |

## 处理过的特殊配置

- **地域绑定密钥**：阿里云百炼（北京、新加坡，以及北京 / 弗吉尼亚 / 东京专属域名）、Kimi（国内 / 海外）、MiniMax（国内 / 海外）、腾讯混元 TokenHub（国内 / 国际）、Bedrock（us-east-1 / us-west-2）都用地域切换。401 的中文提示会提醒检查地域。
- **按模板拼地址**：百炼专属域名 `https://{workspaceId}.{region}.maas.aliyuncs.com/compatible-mode/v1`、Azure `https://{resource}.openai.azure.com/openai/v1`。字段没填时不写 Base URL。
- **模型字段语义不同**：Azure 填部署名称；火山方舟可以填模型 ID 或接入点 ID（`ep-…`）。
- **Claude 5.5**：引擎的原生 Anthropic 适配只认 4.x 型号，所以「Anthropic Claude」预设走官方 OpenAI 兼容层 `https://api.anthropic.com/v1`。原生 Messages 接口或中转站选「Anthropic 原生 / 中转」（`ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN`）。
- **ModelScope 异步出图**：引擎提交时带 `X-ModelScope-Async-Mode: true`，再轮询 `/v1/tasks/{id}`（`X-ModelScope-Task-Type: image_generation`），见 PR #106。
- **Seedream**：openOii 固定请求 1024×1024，最低要求 2K 的 5.0 lite 不在推荐列表里。另外 Seedream 默认带水印。
- **Seedance**：走方舟原生任务接口（`DOUBAO_*`）。时长目前按 5 或 10 秒提交（引擎 `normalizeVideoDuration`），画幅在高级设置里调。
- **推理参数**：Kimi K3 用顶层 `reasoning_effort`（low / high / max），对应高级设置里的「推理强度」。引擎只接受 minimal / low / medium / high / xhigh，所以 `max` 暂时用不了。智谱的 `thinking.type` 目前没有对应的配置项。
- **退役与迁移**：DeepSeek `deepseek-chat` / `deepseek-reasoner` 已于 2026-07-24 下线；腾讯混元旧地址 `api.hunyuan.cloud.tencent.com` 已于 2026-09-30 停用；硅基流动已迁到 `api.siliconflow.cn`；MiniMax M2.5 / M2.7 将于 2026-11-18 下线。
- **千帆**：openOii 不发送 `appid` 头，需要用对全部应用都有权限的 API Key。
- **本地服务**（Ollama、LM Studio）：密钥可以留空。`localhost` 指的是运行 openOii 后端的机器。

## 暂不提供预设的服务商

| 服务商 / 能力 | 原因 |
| --- | --- |
| 可灵 Kling（视频） | AK/SK 签 JWT 鉴权，不是 Bearer Key |
| Vidu（视频） | `Token` 鉴权头，任务轮询接口也是私有格式 |
| 智谱 CogVideoX（视频） | 结果从 `/async-result/{id}` 读取，和引擎的轮询格式不同 |
| MiniMax 海螺视频 / image-01 | 原生接口，不兼容 `/images/generations`、`/videos/generations` |
| 阿里云万相 Wan（图像 / 视频） | 需要 `X-DashScope-Async` 请求头和 DashScope 原生任务接口 |
| 硅基流动 图像 / 视频 | 参数是 `image_size`，返回 `images[]`，和引擎的请求 / 响应格式不同 |
| OpenAI Sora（视频） | 成片要通过 `/videos/{id}/content` 单独下载 |
| Google Veo（视频） | 不在 Gemini 的 OpenAI 兼容端点上 |
| xAI 图像 | 用 `aspect_ratio` 而不是 `size` |
| Amazon Bedrock（SigV4） | 只支持 Bedrock API Key（Bearer），不做 AWS 签名 |
| Azure 旧版部署地址 | `/deployments/{name}?api-version=` 请用「自定义」手动填写 |
| 智谱 z.ai 国际站 | 地址和模型没能在官方文档里核实 |
| Seedream 5.0 lite | 最低 2K，openOii 固定请求 1024×1024 |

这些服务以后接入时需要在引擎里加专门的适配，不能只靠预设。

## 维护

1. 改 `providerPresets.ts`：更新地址、模型和 `sources`，并把 `PRESETS_VERIFIED_AT` 改成核对日期。
2. `providerPresets.test.ts` 会检查：每个真实预设都有 https 来源；地址里的占位字段都有输入说明；预设写入的值能反推回同一个预设和地域；本机网关配置识别为「自定义」。
3. 同步更新本文档。

