// 配置项详细说明
export function getConfigDescription(key: string): string {
	const descriptions: Record<string, string> = {
		// 基础设置
		APP_NAME: "应用名称，用于日志和服务标识",
		ENVIRONMENT: "运行环境：dev（开发）/ staging（预发布）/ prod（生产）",
		LOG_LEVEL: "日志级别：DEBUG / INFO / WARNING / ERROR",
		API_V1_PREFIX: "API 路由前缀，默认 /api/v1",
		CORS_ORIGINS: '跨域配置，JSON 数组格式，如 ["http://localhost:3000"]',

		// 数据库
		DATABASE_URL: "SQLite 数据库连接字符串（需与 pi 引擎指向同一文件）",
		DB_ECHO: "是否在控制台打印 SQL 语句（调试用）",

		// LLM 服务
		ANTHROPIC_API_KEY: "Anthropic 官方 API 密钥",
		ANTHROPIC_AUTH_TOKEN: "中转站 Token（国内推荐使用）",
		ANTHROPIC_BASE_URL: "API 基础地址（官方或中转站地址）",
		ANTHROPIC_MODEL: "Claude 模型名称，如 claude-sonnet-4-5-20250929",

		// 文本生成服务
		TEXT_PROVIDER:
			"文本生成服务提供商：anthropic（Claude）/ openai（OpenAI 兼容）/ fake（本地测试，不调用外部 API）",
		FAKE_TEXT_RESPONSE: "Fake 文本 Provider 固定返回内容（可选）",
		TEXT_BASE_URL: "文本生成服务地址（OpenAI 兼容接口）",
		TEXT_API_KEY: "文本生成 API 密钥（OpenAI 兼容）",
		TEXT_MODEL: "文本生成模型名称（OpenAI 兼容），如 deepseek-v4-flash",
		TEXT_ENDPOINT: "文本生成 API 端点路径（OpenAI 兼容）",
		TEXT_ENABLE_THINKING:
			"是否向支持推理开关的文本模型显式传递 thinking 配置；留空表示由模型/服务默认决定。",
		TEXT_REASONING_EFFORT:
			"推理强度档位，支持 reasoning_effort 的 OpenAI 兼容模型可设为 low / medium / high。",

		// 图像服务
		IMAGE_PROVIDER:
			"图像生成服务提供商：modelscope（ModelScope 异步图片任务）/ openai（OpenAI 兼容）/ fake（本地测试，不调用外部 API）",
		IMAGE_BASE_URL:
			"图像生成服务地址；ModelScope 使用 https://api-inference.modelscope.cn，gpt-image-2 使用 https://image.6668.dpdns.org/v1",
		IMAGE_API_KEY: "图像生成 API 密钥",
		IMAGE_MODEL: "图像生成模型名称，如 gpt-image-2 或 Tongyi-MAI/Z-Image-Turbo",
		IMAGE_ENDPOINT:
			"图像生成 API 端点路径；gpt-image-2 使用 /chat/completions，ModelScope 使用 /v1/images/generations",
		ENABLE_IMAGE_TO_IMAGE: "是否启用图生图（I2I）功能",
		FAKE_IMAGE_FIXTURE_URL:
			"Fake 图像 Provider 固定返回的图片 URL（可选）；留空时使用后端内置本地 SVG 占位图，不调用外部图像 API。",
		CRITIQUE_ENABLED:
			"是否启用 Critic 质量审查闭环；开启后会审查角色图/分镜图，不达标时触发重生成。",
		CRITIQUE_SCORE_THRESHOLD:
			"Critic 质量分阈值（0-10）；低于该分数视为不达标并进入重生成逻辑。",
		CRITIQUE_MAX_ROUNDS:
			"Critic 最多重试轮数；达到上限后为避免卡死会继续后续流程。",
		OUTLINE_ENABLED:
			"是否启用故事大纲审批流程；开启后先生成大纲并等待确认，再继续角色和分镜规划。",

		// 视频服务
		VIDEO_PROVIDER:
			"视频服务提供商：openai（OpenAI 兼容）/ doubao（豆包）/ fake（本地测试）",
		VIDEO_BASE_URL: "视频生成服务地址（OpenAI 兼容接口）",
		VIDEO_API_KEY: "视频生成 API 密钥",
		VIDEO_MODEL: "视频生成模型名称",
		VIDEO_ENDPOINT: "视频生成 API 端点路径",
		VIDEO_MODE: "视频生成模式：text（文生视频）或 image（图生视频）",
		ENABLE_IMAGE_TO_VIDEO: "是否启用图生视频（I2V）功能",
		FAKE_VIDEO_FIXTURE_URL:
			"Fake 视频 Provider 固定返回的视频 URL；推荐使用 /static/videos/*.mp4，本地测试不调用外部视频 API。",
		FAKE_VIDEO_FIXTURE_PATH:
			"Fake 视频 Provider 本地素材文件路径；会复制到后端 static/videos 后返回本地 URL。",

		// 豆包视频
		DOUBAO_API_KEY: "豆包 API 密钥（火山引擎 ARK_API_KEY）",
		DOUBAO_VIDEO_MODEL: "豆包视频模型 ID",
		DOUBAO_VIDEO_DURATION: "豆包视频时长：5 或 10（秒）",
		DOUBAO_VIDEO_RATIO: "豆包视频比例：16:9 / 9:16 / 1:1 / adaptive",
		DOUBAO_GENERATE_AUDIO: "豆包视频是否生成音频",
		VIDEO_IMAGE_MODE:
			"图生视频模式：first_frame（仅首帧）/ reference（拼接参考图）",
		VIDEO_INLINE_LOCAL_IMAGES: "未配置 PUBLIC_BASE_URL 时是否内联本地图片",

		// TTS / BGM
		TTS_ENABLED: "是否启用 TTS 配音（Edge TTS）；关闭后只生成画面/视频，不合成语音。",
		TTS_DEFAULT_VOICE:
			"默认 TTS 语音名称，例如 zh-CN-XiaoxiaoNeural；用于分镜对白配音。",
		BGM_ENABLED: "是否启用背景音乐合成；关闭后最终视频不叠加 BGM。",
		BGM_VOLUME: "背景音乐音量，范围 0-1；数值越大 BGM 越响。",
		TTS_VOLUME: "TTS 人声音量，范围 0-1；数值越大对白越响。",
		BGM_DIRECTORY: "BGM 音频文件目录，相对于后端 app 目录。",

		// 思考链
		THINKING_CHAIN_ENABLED:
			"是否向前端推送 Agent 思考链/阶段说明；关闭可减少运行时消息噪音。",
		THINKING_CHAIN_DETAIL_LEVEL:
			"思考链详细级别：minimal 仅关键结论，normal 含审查阶段，verbose 展示更多规划/推理过程。",

		// 其他
		REQUEST_TIMEOUT_S: "HTTP 请求超时时间（秒）",
		PUBLIC_BASE_URL: "对外可访问的后端地址，用于生成完整 URL",
		ADMIN_TOKEN: "管理员 Token，用于配置更新权限验证",
	};

	return descriptions[key.toUpperCase()] || "暂无说明";
}
