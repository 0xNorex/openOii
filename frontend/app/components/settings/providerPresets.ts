/**
 * 设置页「服务商预设」。
 *
 * 每个预设都来自服务商官方文档（sources），核对日期见 PRESETS_VERIFIED_AT。
 * 预设只是把已有配置项填好：它映射到现有 provider 类型
 * （openai 兼容 / anthropic / modelscope / doubao / fake），不引入新协议。
 * 官方接口和 openOii 的请求形状对不上的服务商不放进来，原因写在 docs/providers.md。
 */

export const PRESETS_VERIFIED_AT = "2026-10-30";

export type PresetService = "text" | "image" | "video";
export type PresetProvider = "openai" | "anthropic" | "modelscope" | "doubao" | "fake";
export type PresetGroup = "domestic" | "global" | "local";

export const PRESET_GROUP_LABEL: Record<PresetGroup, string> = {
	domestic: "国内",
	global: "海外",
	local: "本地与自定义",
};

export interface PresetRegion {
	id: string;
	label: string;
	/** 可以带 {fieldId} 占位，由 fields 填入 */
	baseUrl: string;
}

export interface PresetField {
	id: string;
	label: string;
	placeholder: string;
	help: string;
	/** 只用于正则还原：允许的字符 */
	pattern?: string;
}

export interface ProviderPreset {
	id: string;
	service: PresetService;
	provider: PresetProvider;
	group: PresetGroup;
	name: string;
	/** 无 logo 的文字标记，1–3 个字符 */
	mark: string;
	tagline: string;
	regions: PresetRegion[];
	endpoint?: string;
	defaultModel: string;
	models: string[];
	/** 模型输入框的标题（Azure 填部署名、方舟可填接入点 ID） */
	modelLabel?: string;
	keyHint: string;
	keyUrl?: string;
	/** 本地服务一般不需要密钥 */
	keyOptional?: boolean;
	docsUrl?: string;
	sources: string[];
	fields?: PresetField[];
	notes?: string[];
	experimental?: boolean;
	/** 自定义：不改地址和模型，展开高级设置 */
	custom?: boolean;
}

const CHAT = "/chat/completions";

const TEXT_PRESETS: ProviderPreset[] = [
	{
		id: "deepseek",
		service: "text",
		provider: "openai",
		group: "domestic",
		name: "DeepSeek",
		mark: "DS",
		tagline: "深度求索官方 API",
		regions: [{ id: "default", label: "官方", baseUrl: "https://api.deepseek.com" }],
		endpoint: CHAT,
		defaultModel: "deepseek-flash",
		models: ["deepseek-flash", "deepseek-v4-pro"],
		keyHint: "sk- 开头",
		keyUrl: "https://platform.deepseek.com/api_keys",
		docsUrl: "https://api-docs.deepseek.com/",
		sources: ["https://api-docs.deepseek.com/", "https://api-docs.deepseek.com/updates/"],
		notes: ["deepseek-chat / deepseek-reasoner 已于 2026-07-24 下线。"],
	},
	{
		id: "dashscope",
		service: "text",
		provider: "openai",
		group: "domestic",
		name: "阿里云百炼",
		mark: "百",
		tagline: "通义千问 · OpenAI 兼容模式",
		regions: [
			{ id: "cn-beijing", label: "北京", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1" },
			{ id: "ap-southeast-1", label: "新加坡", baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1" },
			{
				id: "ws-cn-beijing",
				label: "北京 · 专属域名",
				baseUrl: "https://{workspaceId}.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
			},
			{
				id: "ws-us-east-1",
				label: "美国（弗吉尼亚）",
				baseUrl: "https://{workspaceId}.us-east-1.maas.aliyuncs.com/compatible-mode/v1",
			},
			{
				id: "ws-ap-northeast-1",
				label: "日本（东京）",
				baseUrl: "https://{workspaceId}.ap-northeast-1.maas.aliyuncs.com/compatible-mode/v1",
			},
		],
		endpoint: CHAT,
		defaultModel: "qwen3.8-max",
		models: ["qwen3.8-max", "qwen3.7-plus"],
		keyHint: "sk- 开头；密钥绑定地域，北京的密钥不能用于新加坡",
		keyUrl: "https://help.aliyun.com/zh/model-studio/get-api-key",
		docsUrl: "https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope",
		sources: [
			"https://help.aliyun.com/zh/model-studio/compatibility-of-openai-with-dashscope",
			"https://help.aliyun.com/zh/model-studio/get-api-key",
		],
		fields: [
			{
				id: "workspaceId",
				label: "业务空间 ID",
				placeholder: "llm-xxxxxxxx",
				help: "百炼控制台 → 业务空间详情；只有专属域名需要。",
				pattern: "[A-Za-z0-9-]+",
			},
		],
		notes: ["地域和密钥不匹配时会返回 401 invalid_api_key。"],
	},
	{
		id: "zhipu",
		service: "text",
		provider: "openai",
		group: "domestic",
		name: "智谱 BigModel",
		mark: "智",
		tagline: "GLM 系列",
		regions: [{ id: "cn", label: "国内", baseUrl: "https://open.bigmodel.cn/api/paas/v4" }],
		endpoint: CHAT,
		defaultModel: "glm-5.3",
		models: ["glm-5.3", "glm-5.2", "glm-5.3-flash"],
		keyHint: "控制台生成的 API Key（id.secret 形式）",
		keyUrl: "https://bigmodel.cn/usercenter/proj-mgmt/apikeys",
		docsUrl: "https://docs.bigmodel.cn/cn/guide/develop/openai/introduction",
		sources: ["https://docs.bigmodel.cn/cn/guide/develop/openai/introduction"],
		notes: ["temperature 取值 (0, 1)。"],
	},
	{
		id: "kimi",
		service: "text",
		provider: "openai",
		group: "domestic",
		name: "Kimi（月之暗面）",
		mark: "K",
		tagline: "Kimi K3",
		regions: [
			{ id: "cn", label: "国内", baseUrl: "https://api.moonshot.cn/v1" },
			{ id: "global", label: "海外", baseUrl: "https://api.moonshot.ai/v1" },
		],
		endpoint: CHAT,
		defaultModel: "kimi-k3",
		models: ["kimi-k3"],
		keyHint: "sk- 开头；国内站和海外站的密钥互不通用",
		keyUrl: "https://platform.kimi.com/",
		docsUrl: "https://platform.kimi.com/docs/api/overview",
		sources: ["https://platform.kimi.com/docs/api/overview", "https://platform.kimi.com/docs/guide/kimi-k3-quickstart"],
		notes: ["K3 的推理强度对应高级设置里的「推理强度」：low / high 可用，max 引擎暂不支持。"],
	},
	{
		id: "minimax",
		service: "text",
		provider: "openai",
		group: "domestic",
		name: "MiniMax",
		mark: "MM",
		tagline: "MiniMax M3",
		regions: [
			{ id: "cn", label: "国内", baseUrl: "https://api.minimaxi.com/v1" },
			{ id: "global", label: "海外", baseUrl: "https://api.minimax.io/v1" },
		],
		endpoint: CHAT,
		defaultModel: "MiniMax-M3",
		models: ["MiniMax-M3", "MiniMax-M3.1-Flash"],
		keyHint: "密钥按站点区分：国内用 minimaxi.com，海外用 minimax.io",
		keyUrl: "https://platform.minimaxi.com/",
		docsUrl: "https://platform.minimax.io/docs/api-reference/text-openai-api",
		sources: [
			"https://platform.minimax.io/docs/api-reference/text-openai-api",
			"https://platform.minimax.cn/docs/faq/models",
		],
		notes: ["MiniMax-M2.5 / M2.7 将于 2026-11-18 下线。"],
	},
	{
		id: "volcengine",
		service: "text",
		provider: "openai",
		group: "domestic",
		name: "火山方舟",
		mark: "方",
		tagline: "豆包大模型",
		regions: [{ id: "cn-beijing", label: "北京", baseUrl: "https://ark.cn-beijing.volces.com/api/v3" }],
		endpoint: CHAT,
		defaultModel: "doubao-seed-2-1-pro-260915",
		models: ["doubao-seed-2-1-pro-260915"],
		modelLabel: "模型 ID 或接入点 ID（ep-…）",
		keyHint: "方舟 API Key（ARK_API_KEY）",
		keyUrl: "https://ark.volcengine.com/region:cn-beijing/apikey",
		docsUrl: "https://ark.volcengine.com/region:cn-beijing/docs/compatible-with-openai-sdk",
		sources: ["https://ark.volcengine.com/region:cn-beijing/docs/compatible-with-openai-sdk"],
	},
	{
		id: "qianfan",
		service: "text",
		provider: "openai",
		group: "domestic",
		name: "百度千帆",
		mark: "千",
		tagline: "文心 ERNIE 及第三方模型",
		regions: [{ id: "cn", label: "国内", baseUrl: "https://qianfan.baidubce.com/v2" }],
		endpoint: CHAT,
		defaultModel: "ernie-4.5-turbo-128k",
		models: ["ernie-4.5-turbo-128k", "deepseek-v3.1-250821"],
		keyHint: "bce-v3/ALTAK- 开头",
		keyUrl: "https://console.bce.baidu.com/iam/#/iam/apikey/list",
		docsUrl: "https://cloud.baidu.com/doc/qianfan/s/Hmh4suq26",
		sources: ["https://cloud.baidu.com/doc/qianfan/s/Hmh4suq26"],
		notes: ["openOii 不发送 appid 请求头：请使用对全部应用有权限的 API Key。"],
	},
	{
		id: "hunyuan",
		service: "text",
		provider: "openai",
		group: "domestic",
		name: "腾讯混元",
		mark: "混",
		tagline: "TokenHub",
		regions: [
			{ id: "cn", label: "国内", baseUrl: "https://tokenhub.tencentmaas.com/v1" },
			{ id: "intl", label: "国际", baseUrl: "https://tokenhub-intl.tencentcloudmaas.com/v1" },
		],
		endpoint: CHAT,
		defaultModel: "hy4-preview",
		models: ["hy4-preview", "hy3"],
		keyHint: "TokenHub 控制台创建的 API Key",
		keyUrl: "https://cloud.tencent.com/document/product/1823/130051",
		docsUrl: "https://cloud.tencent.com/document/product/1823/130051",
		sources: [
			"https://cloud.tencent.com/document/product/1823/130051",
			"https://cloud.tencent.com/document/product/1823/131382",
		],
		notes: ["旧地址 api.hunyuan.cloud.tencent.com 已于 2026-09-30 停用。"],
	},
	{
		id: "siliconflow",
		service: "text",
		provider: "openai",
		group: "domestic",
		name: "硅基流动",
		mark: "硅",
		tagline: "开源模型聚合",
		regions: [{ id: "cn", label: "国内", baseUrl: "https://api.siliconflow.cn/v1" }],
		endpoint: CHAT,
		defaultModel: "deepseek-ai/DeepSeek-V4.1-Flash",
		models: ["deepseek-ai/DeepSeek-V4.1-Flash", "zai-org/GLM-5.3", "tencent/Hy4-preview"],
		keyHint: "sk- 开头",
		keyUrl: "https://cloud.siliconflow.cn/account/ak",
		docsUrl: "https://docs.siliconflow.cn/",
		sources: ["https://docs.siliconflow.cn/"],
		notes: ["官方已从 .com 迁移到 api.siliconflow.cn。"],
	},
	{
		id: "openai",
		service: "text",
		provider: "openai",
		group: "global",
		name: "OpenAI",
		mark: "OA",
		tagline: "GPT-6 系列",
		regions: [{ id: "default", label: "官方", baseUrl: "https://api.openai.com/v1" }],
		endpoint: CHAT,
		defaultModel: "gpt-6-astra",
		models: ["gpt-6-astra", "gpt-6.1-terra", "gpt-6.1-sol"],
		keyHint: "sk- 开头",
		keyUrl: "https://platform.openai.com/api-keys",
		docsUrl: "https://developers.openai.com/api/reference/python/resources/chat/index.md",
		sources: ["https://developers.openai.com/api/docs/changelog"],
	},
	{
		id: "anthropic",
		service: "text",
		provider: "openai",
		group: "global",
		name: "Anthropic Claude",
		mark: "A",
		tagline: "官方 OpenAI 兼容层",
		regions: [{ id: "default", label: "官方", baseUrl: "https://api.anthropic.com/v1" }],
		endpoint: CHAT,
		defaultModel: "claude-sonnet-5-5",
		models: ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"],
		keyHint: "sk-ant- 开头",
		keyUrl: "https://console.anthropic.com/settings/keys",
		docsUrl: "https://platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk",
		sources: [
			"https://platform.claude.com/docs/en/cli-sdks-libraries/libraries/openai-sdk",
			"https://platform.claude.com/docs/en/models/overview",
		],
		notes: [
			"走 Anthropic 官方的 OpenAI 兼容层，Claude 5.5 系列可直接用；提示缓存、引用等原生特性不可用。",
			"需要原生 Messages 接口或中转站时选「Anthropic 原生 / 中转」。",
		],
	},
	{
		id: "gemini",
		service: "text",
		provider: "openai",
		group: "global",
		name: "Google Gemini",
		mark: "G",
		tagline: "OpenAI 兼容端点",
		regions: [{ id: "default", label: "官方", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai" }],
		endpoint: CHAT,
		defaultModel: "gemini-3.8-flash",
		models: ["gemini-3.8-flash"],
		keyHint: "AI Studio 生成的 API Key",
		keyUrl: "https://aistudio.google.com/apikey",
		docsUrl: "https://ai.google.dev/gemini-api/docs/openai",
		sources: ["https://ai.google.dev/gemini-api/docs/openai"],
	},
	{
		id: "xai",
		service: "text",
		provider: "openai",
		group: "global",
		name: "xAI Grok",
		mark: "X",
		tagline: "Grok 4.7",
		regions: [{ id: "default", label: "官方", baseUrl: "https://api.x.ai/v1" }],
		endpoint: CHAT,
		defaultModel: "grok-4.7",
		models: ["grok-4.7", "grok-4.6"],
		keyHint: "xai- 开头",
		keyUrl: "https://console.x.ai/",
		docsUrl: "https://docs.x.ai/developers/rest-api-reference/inference/chat-completions",
		sources: ["https://docs.x.ai/developers/rest-api-reference/inference/chat-completions"],
		notes: ["推理模型响应较慢，可把高级设置里的请求超时调大。"],
	},
	{
		id: "mistral",
		service: "text",
		provider: "openai",
		group: "global",
		name: "Mistral",
		mark: "M",
		tagline: "Mistral Large",
		regions: [{ id: "default", label: "官方", baseUrl: "https://api.mistral.ai/v1" }],
		endpoint: CHAT,
		defaultModel: "mistral-large-4",
		models: ["mistral-large-4", "mistral-medium-3-5"],
		keyHint: "控制台生成的 API Key",
		keyUrl: "https://console.mistral.ai/api-keys",
		docsUrl: "https://docs.mistral.ai/api",
		sources: ["https://docs.mistral.ai/api", "https://docs.mistral.ai/models.md"],
	},
	{
		id: "openrouter",
		service: "text",
		provider: "openai",
		group: "global",
		name: "OpenRouter",
		mark: "OR",
		tagline: "多家模型统一入口",
		regions: [{ id: "default", label: "官方", baseUrl: "https://openrouter.ai/api/v1" }],
		endpoint: CHAT,
		defaultModel: "openrouter/auto",
		models: ["openrouter/auto"],
		modelLabel: "模型（厂商/模型名）",
		keyHint: "sk-or- 开头",
		keyUrl: "https://openrouter.ai/keys",
		docsUrl: "https://openrouter.ai/docs/quickstart",
		sources: ["https://openrouter.ai/docs/quickstart"],
	},
	{
		id: "groq",
		service: "text",
		provider: "openai",
		group: "global",
		name: "Groq",
		mark: "Gq",
		tagline: "低延迟推理",
		regions: [{ id: "default", label: "官方", baseUrl: "https://api.groq.com/openai/v1" }],
		endpoint: CHAT,
		defaultModel: "openai/gpt-oss-120b",
		models: ["openai/gpt-oss-120b", "openai/gpt-oss-20b"],
		keyHint: "gsk_ 开头",
		keyUrl: "https://console.groq.com/keys",
		docsUrl: "https://console.groq.com/docs/openai",
		sources: ["https://console.groq.com/docs/openai", "https://console.groq.com/docs/models"],
	},
	{
		id: "together",
		service: "text",
		provider: "openai",
		group: "global",
		name: "Together AI",
		mark: "T",
		tagline: "开源模型托管",
		regions: [{ id: "default", label: "官方", baseUrl: "https://api.together.xyz/v1" }],
		endpoint: CHAT,
		defaultModel: "openai/gpt-oss-120b",
		models: ["openai/gpt-oss-120b"],
		keyHint: "控制台生成的 API Key",
		keyUrl: "https://api.together.ai/settings/api-keys",
		docsUrl: "https://docs.together.ai/docs/openai-api-compatibility",
		sources: ["https://docs.together.ai/docs/openai-api-compatibility"],
	},
	{
		id: "azure",
		service: "text",
		provider: "openai",
		group: "global",
		name: "Azure OpenAI",
		mark: "Az",
		tagline: "v1 接口 · 按部署调用",
		regions: [{ id: "default", label: "资源终结点", baseUrl: "https://{resource}.openai.azure.com/openai/v1" }],
		endpoint: CHAT,
		defaultModel: "",
		models: [],
		modelLabel: "部署名称",
		keyHint: "Azure 门户 → 资源 → 密钥和终结点",
		keyUrl: "https://portal.azure.com/",
		docsUrl: "https://learn.microsoft.com/azure/ai-foundry/openai/api-version-lifecycle",
		sources: ["https://learn.microsoft.com/azure/ai-foundry/openai/api-version-lifecycle"],
		fields: [
			{
				id: "resource",
				label: "资源名称",
				placeholder: "my-openai",
				help: "终结点 https://<资源名称>.openai.azure.com 里的那一段。",
				pattern: "[A-Za-z0-9-]+",
			},
		],
		notes: ["使用不带 api-version 的 v1 接口；旧的 /deployments/…?api-version= 地址请用自定义。"],
	},
	{
		id: "bedrock",
		service: "text",
		provider: "openai",
		group: "global",
		name: "Amazon Bedrock",
		mark: "AWS",
		tagline: "Chat Completions 兼容端点",
		regions: [
			{ id: "us-east-1", label: "us-east-1", baseUrl: "https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1" },
			{ id: "us-west-2", label: "us-west-2", baseUrl: "https://bedrock-runtime.us-west-2.amazonaws.com/openai/v1" },
		],
		endpoint: CHAT,
		defaultModel: "openai.gpt-oss-120b-1:0",
		models: ["openai.gpt-oss-120b-1:0", "openai.gpt-oss-20b-1:0"],
		keyHint: "Bedrock API Key（不支持 AK/SK 签名）",
		keyUrl: "https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys-use.html",
		docsUrl: "https://docs.aws.amazon.com/bedrock/latest/userguide/inference-chat-completions.html",
		sources: ["https://docs.aws.amazon.com/bedrock/latest/userguide/inference-chat-completions.html"],
		notes: ["只能用 Bedrock API Key（Bearer）；AWS SigV4 签名不支持。"],
	},
	{
		id: "ollama",
		service: "text",
		provider: "openai",
		group: "local",
		name: "Ollama",
		mark: "Ol",
		tagline: "本机模型",
		regions: [{ id: "local", label: "本机", baseUrl: "http://localhost:11434/v1" }],
		endpoint: CHAT,
		defaultModel: "",
		models: [],
		modelLabel: "模型（ollama list 里的名字）",
		keyHint: "不校验，任意填写即可（如 ollama）",
		keyOptional: true,
		docsUrl: "https://docs.ollama.com/api/openai-compatibility",
		sources: ["https://docs.ollama.com/api/openai-compatibility"],
		notes: ["localhost 指运行 openOii 后端的机器；本地地址需先保存再测试连接。"],
	},
	{
		id: "lmstudio",
		service: "text",
		provider: "openai",
		group: "local",
		name: "LM Studio",
		mark: "LM",
		tagline: "本机模型",
		regions: [{ id: "local", label: "本机", baseUrl: "http://localhost:1234/v1" }],
		endpoint: CHAT,
		defaultModel: "",
		models: [],
		modelLabel: "模型（LM Studio 里已加载的模型 ID）",
		keyHint: "默认不需要；开启鉴权后填 LM Studio 的 Token",
		keyOptional: true,
		docsUrl: "https://lmstudio.ai/docs/developer/openai-compat",
		sources: ["https://lmstudio.ai/docs/developer/openai-compat"],
		notes: ["localhost 指运行 openOii 后端的机器；本地地址需先保存再测试连接。"],
	},
	{
		id: "custom-openai",
		service: "text",
		provider: "openai",
		group: "local",
		name: "自定义 OpenAI 兼容",
		mark: "…",
		tagline: "网关、中转或自建服务",
		regions: [],
		endpoint: CHAT,
		defaultModel: "",
		models: [],
		keyHint: "按服务要求填写",
		sources: [],
		custom: true,
	},
	{
		id: "anthropic-native",
		service: "text",
		provider: "anthropic",
		group: "local",
		name: "Anthropic 原生 / 中转",
		mark: "A·",
		tagline: "Messages 接口",
		regions: [],
		defaultModel: "",
		models: ["claude-sonnet-4-5-20250929"],
		keyHint: "官方用 API 密钥，中转站用 Token",
		sources: [],
		custom: true,
		notes: ["引擎的原生 Claude 适配只认 4.x 型号；Claude 5.5 请用上面的「Anthropic Claude」。"],
	},
	{
		id: "fake-text",
		service: "text",
		provider: "fake",
		group: "local",
		name: "Fake 本地测试",
		mark: "F",
		tagline: "不调用外部 API",
		regions: [],
		defaultModel: "",
		models: [],
		keyHint: "",
		keyOptional: true,
		sources: [],
	},
];

const IMAGE_PRESETS: ProviderPreset[] = [
	{
		id: "seedream",
		service: "image",
		provider: "openai",
		group: "domestic",
		name: "火山方舟 Seedream",
		mark: "方",
		tagline: "豆包图像生成",
		regions: [{ id: "cn-beijing", label: "北京", baseUrl: "https://ark.cn-beijing.volces.com/api/v3" }],
		endpoint: "/images/generations",
		defaultModel: "doubao-seedream-4-0-250828",
		models: ["doubao-seedream-4-0-250828", "doubao-seedream-5-0-pro-260628", "doubao-seedream-5-0-flash-260915"],
		keyHint: "方舟 API Key（ARK_API_KEY）",
		keyUrl: "https://ark.volcengine.com/region:cn-beijing/apikey",
		docsUrl: "https://ark.volcengine.com/region:cn-beijing/docs/image-generation-api",
		sources: ["https://ark.volcengine.com/region:cn-beijing/docs/image-generation-api"],
		notes: [
			"openOii 固定请求 1024×1024：5.0 lite 最低 2K，不在推荐列表里。",
			"Seedream 默认加水印，openOii 目前不传 watermark 参数。",
		],
	},
	{
		id: "cogview",
		service: "image",
		provider: "openai",
		group: "domestic",
		name: "智谱 CogView",
		mark: "智",
		tagline: "CogView-4",
		regions: [{ id: "cn", label: "国内", baseUrl: "https://open.bigmodel.cn/api/paas/v4" }],
		endpoint: "/images/generations",
		defaultModel: "cogview-4-250304",
		models: ["cogview-4-250304", "cogview-4"],
		keyHint: "智谱 API Key",
		keyUrl: "https://bigmodel.cn/usercenter/proj-mgmt/apikeys",
		docsUrl: "https://docs.bigmodel.cn/cn/guide/models/image-generation/cogview-4",
		sources: ["https://docs.bigmodel.cn/cn/guide/models/image-generation/cogview-4"],
	},
	{
		id: "modelscope",
		service: "image",
		provider: "modelscope",
		group: "domestic",
		name: "ModelScope 魔搭",
		mark: "魔",
		tagline: "异步出图 · 免费额度",
		regions: [{ id: "cn", label: "国内", baseUrl: "https://api-inference.modelscope.cn" }],
		endpoint: "/v1/images/generations",
		defaultModel: "Tongyi-MAI/Z-Image-Turbo",
		models: ["Tongyi-MAI/Z-Image-Turbo", "Qwen/Qwen-Image"],
		keyHint: "ModelScope 访问令牌（ms- 开头）",
		keyUrl: "https://modelscope.cn/my/myaccesstoken",
		docsUrl: "https://modelscope.cn/docs/model-service/API-Inference/intro",
		sources: ["https://modelscope.cn/docs/model-service/API-Inference/intro"],
		notes: ["异步任务：提交后轮询 /v1/tasks/{id}，引擎和后端都已支持。"],
	},
	{
		id: "openai-image",
		service: "image",
		provider: "openai",
		group: "global",
		name: "OpenAI 图像",
		mark: "OA",
		tagline: "gpt-image 2.5",
		regions: [{ id: "default", label: "官方", baseUrl: "https://api.openai.com/v1" }],
		endpoint: "/images/generations",
		defaultModel: "gpt-image-2.5-flare",
		models: ["gpt-image-2.5-flare", "gpt-image-2.5-sunburst"],
		keyHint: "sk- 开头",
		keyUrl: "https://platform.openai.com/api-keys",
		docsUrl: "https://developers.openai.com/api/docs/guides/image-generation",
		sources: ["https://developers.openai.com/api/docs/guides/image-generation"],
	},
	{
		id: "custom-image",
		service: "image",
		provider: "openai",
		group: "local",
		name: "自定义 OpenAI 兼容",
		mark: "…",
		tagline: "/images/generations 接口",
		regions: [],
		endpoint: "/images/generations",
		defaultModel: "",
		models: [],
		keyHint: "按服务要求填写",
		sources: [],
		custom: true,
	},
	{
		id: "fake-image",
		service: "image",
		provider: "fake",
		group: "local",
		name: "Fake 本地测试",
		mark: "F",
		tagline: "返回占位图",
		regions: [],
		defaultModel: "",
		models: [],
		keyHint: "",
		keyOptional: true,
		sources: [],
	},
];

const VIDEO_PRESETS: ProviderPreset[] = [
	{
		id: "seedance",
		service: "video",
		provider: "doubao",
		group: "domestic",
		name: "火山方舟 Seedance",
		mark: "方",
		tagline: "豆包视频生成",
		regions: [],
		defaultModel: "doubao-seedance-2-5-260628",
		models: ["doubao-seedance-2-5-260628", "doubao-seedance-1-5-pro-251215"],
		keyHint: "方舟 API Key（ARK_API_KEY）",
		keyUrl: "https://ark.volcengine.com/region:cn-beijing/apikey",
		docsUrl: "https://ark.volcengine.com/region:cn-beijing/docs/list-video-generation-tasks-api",
		sources: [
			"https://ark.volcengine.com/region:cn-beijing/docs/list-video-generation-tasks-api",
			"https://ark.volcengine.com/region:cn-beijing/docs/create-video-generation-task-api",
		],
		notes: ["固定使用北京地域；时长和画幅在高级设置里调整。"],
	},
	{
		id: "xai-video",
		service: "video",
		provider: "openai",
		group: "global",
		name: "xAI Grok Imagine",
		mark: "X",
		tagline: "文生视频",
		regions: [{ id: "default", label: "官方", baseUrl: "https://api.x.ai/v1" }],
		endpoint: "/videos/generations",
		defaultModel: "grok-imagine-video-1.5",
		models: ["grok-imagine-video-1.5", "grok-imagine-video-1.5-lite"],
		keyHint: "xai- 开头",
		keyUrl: "https://console.x.ai/",
		docsUrl: "https://docs.x.ai/developers/model-capabilities/video/generation",
		sources: [
			"https://docs.x.ai/developers/model-capabilities/video/generation",
			"https://docs.x.ai/developers/rest-api-reference/inference/videos",
		],
		experimental: true,
		notes: [
			"返回 request_id 后轮询 /v1/videos/{id}，与 openOii 的异步任务流程一致。",
			"xAI 的图生视频参数叫 image，openOii 发送的是 image_url：目前按文生视频使用。",
		],
	},
	{
		id: "custom-video",
		service: "video",
		provider: "openai",
		group: "local",
		name: "自定义 OpenAI 兼容",
		mark: "…",
		tagline: "/videos/generations 接口",
		regions: [],
		endpoint: "/videos/generations",
		defaultModel: "",
		models: [],
		keyHint: "按服务要求填写",
		sources: [],
		custom: true,
	},
	{
		id: "fake-video",
		service: "video",
		provider: "fake",
		group: "local",
		name: "Fake 本地测试",
		mark: "F",
		tagline: "使用本地视频素材",
		regions: [],
		defaultModel: "",
		models: [],
		keyHint: "",
		keyOptional: true,
		sources: [],
	},
];

export const PROVIDER_PRESETS: Record<PresetService, ProviderPreset[]> = {
	text: TEXT_PRESETS,
	image: IMAGE_PRESETS,
	video: VIDEO_PRESETS,
};

export function isPresetService(tab: string): tab is PresetService {
	return tab === "text" || tab === "image" || tab === "video";
}

export function presetById(service: PresetService, id: string) {
	return PROVIDER_PRESETS[service].find((p) => p.id === id);
}

/** 预设写入哪些配置项（大写键名） */
export interface PresetKeys {
	provider: string;
	baseUrl?: string;
	endpoint?: string;
	model?: string;
	apiKey?: string;
}

export function presetKeys(preset: ProviderPreset): PresetKeys {
	if (preset.service === "text") {
		if (preset.provider === "anthropic") {
			return { provider: "TEXT_PROVIDER", baseUrl: "ANTHROPIC_BASE_URL", model: "ANTHROPIC_MODEL", apiKey: "ANTHROPIC_AUTH_TOKEN" };
		}
		if (preset.provider === "fake") return { provider: "TEXT_PROVIDER" };
		return { provider: "TEXT_PROVIDER", baseUrl: "TEXT_BASE_URL", endpoint: "TEXT_ENDPOINT", model: "TEXT_MODEL", apiKey: "TEXT_API_KEY" };
	}
	if (preset.service === "image") {
		if (preset.provider === "fake") return { provider: "IMAGE_PROVIDER" };
		return { provider: "IMAGE_PROVIDER", baseUrl: "IMAGE_BASE_URL", endpoint: "IMAGE_ENDPOINT", model: "IMAGE_MODEL", apiKey: "IMAGE_API_KEY" };
	}
	if (preset.provider === "fake") return { provider: "VIDEO_PROVIDER" };
	if (preset.provider === "doubao") return { provider: "VIDEO_PROVIDER", model: "DOUBAO_VIDEO_MODEL", apiKey: "DOUBAO_API_KEY" };
	return { provider: "VIDEO_PROVIDER", baseUrl: "VIDEO_BASE_URL", endpoint: "VIDEO_ENDPOINT", model: "VIDEO_MODEL", apiKey: "VIDEO_API_KEY" };
}

const PLACEHOLDER = /\{(\w+)\}/g;

export function regionNeeds(region: PresetRegion | undefined): string[] {
	if (!region) return [];
	return Array.from(region.baseUrl.matchAll(PLACEHOLDER), (m) => m[1]!);
}

export function fillBaseUrl(region: PresetRegion, fields: Record<string, string>): string | null {
	let missing = false;
	const url = region.baseUrl.replace(PLACEHOLDER, (_, id: string) => {
		const value = (fields[id] ?? "").trim();
		if (!value) missing = true;
		return value;
	});
	return missing ? null : url;
}

export interface PresetSelection {
	regionId?: string;
	fields?: Record<string, string>;
	model?: string;
}

/**
 * 选中预设后要写入的配置值。不写密钥；自定义预设只切换 provider 类型，
 * 保留用户已有的地址和模型。地址里的占位字段没填时不写 Base URL。
 */
export function presetConfigValues(preset: ProviderPreset, selection: PresetSelection = {}): Record<string, string> {
	const keys = presetKeys(preset);
	const values: Record<string, string> = { [keys.provider]: preset.provider };
	if (preset.custom) return values;
	const region = preset.regions.find((r) => r.id === selection.regionId) ?? preset.regions[0];
	if (keys.baseUrl && region) {
		const url = fillBaseUrl(region, selection.fields ?? {});
		if (url) values[keys.baseUrl] = url;
	}
	if (keys.endpoint && preset.endpoint) values[keys.endpoint] = preset.endpoint;
	const model = selection.model ?? preset.defaultModel;
	if (keys.model && model) values[keys.model] = model;
	return values;
}

function normalizeUrl(url: string) {
	return url.trim().replace(/\/+$/, "").toLowerCase();
}

function escapeRegExp(text: string) {
	return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export interface DetectedPreset {
	preset: ProviderPreset;
	regionId?: string;
	fields: Record<string, string>;
}

/** 根据现有配置反推正在用哪个预设；认不出的落到对应的自定义 / Fake 预设。 */
export function detectPreset(service: PresetService, form: Record<string, unknown>): DetectedPreset {
	const read = (key: string) => String(form[key] ?? form[key.toLowerCase()] ?? "");
	const providerKey = `${service.toUpperCase()}_PROVIDER`;
	const fallbackProvider = service === "text" ? "anthropic" : service === "image" ? "modelscope" : "openai";
	const provider = (read(providerKey) || fallbackProvider).toLowerCase();
	const presets = PROVIDER_PRESETS[service].filter((p) => p.provider === provider);
	for (const preset of presets) {
		if (preset.custom) continue;
		const keys = presetKeys(preset);
		if (!keys.baseUrl) {
			// fake / doubao：只按 provider 类型识别
			return { preset, fields: {} };
		}
		const current = normalizeUrl(read(keys.baseUrl));
		if (!current) continue;
		for (const region of preset.regions) {
			const names = regionNeeds(region);
			const source = escapeRegExp(normalizeUrl(region.baseUrl)).replace(/\\\{(\w+)\\\}/g, "([a-z0-9-]+)");
			const match = new RegExp(`^${source}$`).exec(current);
			if (match) {
				const fields = Object.fromEntries(names.map((name, i) => [name, match[i + 1] ?? ""]));
				return { preset, regionId: region.id, fields };
			}
		}
	}
	const custom = PROVIDER_PRESETS[service].find((p) => p.custom && p.provider === provider);
	const fake = PROVIDER_PRESETS[service].find((p) => p.provider === provider);
	return { preset: custom ?? fake ?? PROVIDER_PRESETS[service].find((p) => p.custom)!, fields: {} };
}
