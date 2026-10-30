import { describe, expect, it } from "vitest";
import {
	PRESETS_VERIFIED_AT,
	PROVIDER_PRESETS,
	detectPreset,
	fillBaseUrl,
	presetById,
	presetConfigValues,
	presetKeys,
	regionNeeds,
	type PresetService,
} from "./providerPresets";
import { getConfigLabel } from "./configLabels";

const SERVICES: PresetService[] = ["text", "image", "video"];

describe("providerPresets 数据", () => {
	it("核对日期固定为 2026-10-30", () => {
		expect(PRESETS_VERIFIED_AT).toBe("2026-10-30");
	});

	it.each(SERVICES)("%s：id 唯一，每个真实服务商都有官方来源和 https 地址", (service) => {
		const presets = PROVIDER_PRESETS[service];
		expect(new Set(presets.map((p) => p.id)).size).toBe(presets.length);
		for (const p of presets) {
			expect(p.service).toBe(service);
			expect(p.mark.length).toBeGreaterThan(0);
			expect(p.mark.length).toBeLessThanOrEqual(3);
			if (p.custom || p.provider === "fake") continue;
			expect(p.sources.length, p.id).toBeGreaterThan(0);
			for (const src of p.sources) expect(src, p.id).toMatch(/^https:\/\//);
			if (p.group !== "local") {
				for (const r of p.regions) expect(r.baseUrl, p.id).toMatch(/^https:\/\//);
			}
			// Azure 等按部署名调用的没有默认模型，但必须改模型输入框的标题
			if (p.defaultModel) expect(p.models, p.id).toContain(p.defaultModel);
			else expect(p.modelLabel, p.id).toBeTruthy();
			// 地址里的占位字段必须有对应的输入说明
			for (const r of p.regions) {
				for (const need of regionNeeds(r)) expect(p.fields?.some((f) => f.id === need), `${p.id}.${need}`).toBe(true);
			}
		}
	});

	it("每个服务都有自定义和 Fake 两个兜底选项", () => {
		for (const service of SERVICES) {
			expect(PROVIDER_PRESETS[service].some((p) => p.custom)).toBe(true);
			expect(PROVIDER_PRESETS[service].some((p) => p.provider === "fake")).toBe(true);
		}
	});
});

describe("presetConfigValues", () => {
	it("DeepSeek 填好 provider、地址、路径和默认模型，不写密钥", () => {
		const values = presetConfigValues(presetById("text", "deepseek")!);
		expect(values).toEqual({
			TEXT_PROVIDER: "openai",
			TEXT_BASE_URL: "https://api.deepseek.com",
			TEXT_ENDPOINT: "/chat/completions",
			TEXT_MODEL: "deepseek-flash",
		});
		expect(Object.keys(values).some((k) => k.includes("KEY") || k.includes("TOKEN"))).toBe(false);
	});

	it("地域切换换 Base URL（Kimi 海外站）", () => {
		const values = presetConfigValues(presetById("text", "kimi")!, { regionId: "global" });
		expect(values.TEXT_BASE_URL).toBe("https://api.moonshot.ai/v1");
	});

	it("百炼业务空间地址需要 workspaceId，没填时不写 Base URL", () => {
		const preset = presetById("text", "dashscope")!;
		expect(presetConfigValues(preset, { regionId: "ws-cn-beijing" }).TEXT_BASE_URL).toBeUndefined();
		const values = presetConfigValues(preset, { regionId: "ws-cn-beijing", fields: { workspaceId: "ws-abc123" } });
		expect(values.TEXT_BASE_URL).toBe("https://ws-abc123.cn-beijing.maas.aliyuncs.com/compatible-mode/v1");
	});

	it("Azure 按资源名拼出 v1 地址", () => {
		const preset = presetById("text", "azure")!;
		const region = preset.regions[0]!;
		expect(regionNeeds(region)).toEqual(["resource"]);
		expect(fillBaseUrl(region, { resource: " my-res " })).toBe("https://my-res.openai.azure.com/openai/v1");
		expect(fillBaseUrl(region, {})).toBeNull();
	});

	it("自定义只切换 provider，保留已有地址和模型", () => {
		expect(presetConfigValues(presetById("text", "custom-openai")!)).toEqual({ TEXT_PROVIDER: "openai" });
	});

	it("豆包视频走 DOUBAO_* 键，Fake 只切 provider", () => {
		const seedance = presetById("video", "seedance")!;
		expect(presetKeys(seedance)).toEqual({ provider: "VIDEO_PROVIDER", model: "DOUBAO_VIDEO_MODEL", apiKey: "DOUBAO_API_KEY" });
		expect(presetConfigValues(seedance).VIDEO_PROVIDER).toBe("doubao");
		expect(presetConfigValues(presetById("image", "fake-image")!)).toEqual({ IMAGE_PROVIDER: "fake" });
	});

	it("Claude 预设走 OpenAI 兼容层，原生 Anthropic 用 ANTHROPIC_* 键", () => {
		const compat = presetById("text", "anthropic")!;
		expect(presetConfigValues(compat).TEXT_BASE_URL).toBe("https://api.anthropic.com/v1");
		expect(presetKeys(presetById("text", "anthropic-native")!).apiKey).toBe("ANTHROPIC_AUTH_TOKEN");
	});
});

describe("detectPreset", () => {
	it("当前本机网关配置（muse 系列，127.0.0.1:18790）识别为自定义", () => {
		const detected = detectPreset("text", {
			TEXT_PROVIDER: "openai",
			TEXT_BASE_URL: "http://127.0.0.1:18790/v1",
			TEXT_MODEL: "muse-large",
		});
		expect(detected.preset.id).toBe("custom-openai");
	});

	it("预设写入的值能被反推回同一个预设和地域", () => {
		for (const service of SERVICES) {
			for (const preset of PROVIDER_PRESETS[service]) {
				if (preset.custom) continue;
				for (const region of preset.regions.length ? preset.regions : [undefined]) {
					const fields = Object.fromEntries(regionNeeds(region).map((n) => [n, "abc-1"]));
					const values = presetConfigValues(preset, { regionId: region?.id, fields });
					const detected = detectPreset(service, values);
					// 同一地址可能被多个预设共用时，至少落在同 provider 上
					expect(detected.preset.provider, `${preset.id}/${region?.id}`).toBe(preset.provider);
					if (presetKeys(preset).baseUrl) {
						expect(detected.preset.id, `${preset.id}/${region?.id}`).toBe(preset.id);
						expect(detected.regionId).toBe(region?.id);
						expect(detected.fields).toEqual(fields);
					}
				}
			}
		}
	});

	it("地址末尾斜杠和大小写不影响识别", () => {
		const detected = detectPreset("text", { TEXT_PROVIDER: "openai", TEXT_BASE_URL: "HTTPS://API.DEEPSEEK.COM/" });
		expect(detected.preset.id).toBe("deepseek");
	});

	it("没填 provider 时按后端默认值识别（文本 anthropic、图像 modelscope、视频 openai）", () => {
		expect(detectPreset("text", {}).preset.id).toBe("anthropic-native");
		expect(detectPreset("image", { IMAGE_BASE_URL: "https://api-inference.modelscope.cn" }).preset.id).toBe("modelscope");
		expect(detectPreset("video", {}).preset.id).toBe("custom-video");
	});

	it("支持小写回退键", () => {
		expect(detectPreset("text", { text_provider: "fake" }).preset.id).toBe("fake-text");
	});
});

describe("configLabels", () => {
	it("主要配置项都有中文名，未登记的键退回环境变量名", () => {
		for (const key of ["TEXT_BASE_URL", "IMAGE_MODEL", "DOUBAO_API_KEY", "ANTHROPIC_AUTH_TOKEN", "redis_url"]) {
			expect(getConfigLabel(key)).toMatch(/[\u4e00-\u9fa5]|API Key|Redis/);
		}
		expect(getConfigLabel("some_new_key")).toBe("SOME_NEW_KEY");
	});
});
