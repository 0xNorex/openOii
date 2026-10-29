import {
	CircleStackIcon,
	PhotoIcon,
	SparklesIcon,
	VideoCameraIcon,
	WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import type { ConfigItem } from "~/types";

type Icon = typeof SparklesIcon;

export const TAB_CONFIG: Record<string, { icon: Icon; title: string; desc: string }> = {
	basic: { icon: WrenchScrewdriverIcon, title: "基础", desc: "应用名称、环境、日志级别等基础配置" },
	database: { icon: CircleStackIcon, title: "数据库", desc: "数据库和 Redis 连接配置" },
	text: {
		icon: SparklesIcon,
		title: "文本生成",
		desc: "文本生成服务配置，支持 Anthropic、OpenAI 兼容接口和 Fake 本地测试",
	},
	image: {
		icon: PhotoIcon,
		title: "图像服务",
		desc: "图像生成服务配置，默认使用 ModelScope Z-Image-Turbo，也支持 OpenAI 兼容接口和 Fake 本地测试",
	},
	video: {
		icon: VideoCameraIcon,
		title: "视频服务",
		desc: "视频生成服务配置，支持 OpenAI 兼容接口、豆包和 Fake 本地测试",
	},
};

export interface ProviderGroup {
	title: string | ((provider: string) => string);
	/** 只在这些 provider 下显示；省略表示总是显示（通用配置） */
	providers?: string[];
	match: (key: string) => boolean;
	note?: string;
}

export interface ProviderTab {
	providerKey: string;
	defaultProvider: string;
	icon: Icon;
	layout: "row" | "grid";
	options: { value: string; title: string; desc: string }[];
	groups: ProviderGroup[];
}

const VIDEO_COMMON = ["video_image_mode", "enable_image_to_video", "video_inline_local_images"];

/** 文本 / 图像 / 视频三个 provider 页签的声明：选 provider，再显示对应分组 */
export const PROVIDER_TABS: Record<string, ProviderTab> = {
	text: {
		providerKey: "text_provider",
		defaultProvider: "anthropic",
		icon: SparklesIcon,
		layout: "row",
		options: [
			{ value: "anthropic", title: "Anthropic Claude", desc: "Anthropic 兼容接口，推荐使用" },
			{ value: "openai", title: "OpenAI 兼容", desc: "支持任何 OpenAI 兼容接口" },
			{ value: "fake", title: "Fake 本地测试", desc: "不调用外部文本 API，避免测试扣费" },
		],
		groups: [
			{ title: "Anthropic Claude 配置", providers: ["anthropic"], match: (k) => k.startsWith("anthropic_") },
			{
				title: "OpenAI 兼容接口配置",
				providers: ["openai"],
				match: (k) => k.startsWith("text_") && k !== "text_provider",
			},
			{
				title: "Fake 本地测试配置",
				providers: ["fake"],
				match: (k) => k.startsWith("fake_text_"),
				note: "启用后生成链路不会调用外部文本生成 API。",
			},
		],
	},
	image: {
		providerKey: "image_provider",
		defaultProvider: "modelscope",
		icon: PhotoIcon,
		layout: "grid",
		options: [
			{ value: "openai", title: "OpenAI 兼容", desc: "可用于 gpt-image-2 等兼容接口" },
			{ value: "modelscope", title: "ModelScope", desc: "异步图片任务，支持 Z-Image-Turbo" },
			{ value: "fake", title: "Fake 本地测试", desc: "返回本地占位图，不调用外部图像 API" },
		],
		groups: [
			{
				title: (p) => (p === "modelscope" ? "ModelScope 图像接口配置" : "OpenAI 兼容接口配置"),
				providers: ["modelscope", "openai"],
				match: (k) => k.startsWith("image_") && k !== "image_provider",
			},
			{
				title: "Fake 本地测试配置",
				providers: ["fake"],
				match: (k) => k.startsWith("fake_image_"),
				note: "未配置固定 URL 时会返回内置 SVG 占位图。",
			},
			{ title: "通用配置", match: (k) => k === "enable_image_to_image" },
		],
	},
	video: {
		providerKey: "video_provider",
		defaultProvider: "openai",
		icon: VideoCameraIcon,
		layout: "row",
		options: [
			{ value: "doubao", title: "豆包视频", desc: "火山引擎 Ark API，国内推荐" },
			{ value: "openai", title: "OpenAI 兼容", desc: "支持任何 OpenAI 兼容接口" },
			{ value: "fake", title: "Fake 本地测试", desc: "使用本地视频素材，不调用外部视频 API" },
		],
		groups: [
			{ title: "豆包视频配置", providers: ["doubao"], match: (k) => k.startsWith("doubao_") },
			{
				title: "OpenAI 兼容接口配置",
				providers: ["openai"],
				match: (k) => k.startsWith("video_") && k !== "video_provider" && !VIDEO_COMMON.includes(k),
			},
			{ title: "Fake 本地测试配置", providers: ["fake"], match: (k) => k.startsWith("fake_video_") },
			{ title: "通用配置", match: (k) => VIDEO_COMMON.includes(k) },
		],
	},
};

export function itemsFor(items: ConfigItem[], match: (key: string) => boolean) {
	return items.filter((i) => match(i.key.toLowerCase()));
}
