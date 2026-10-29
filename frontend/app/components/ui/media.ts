import type { SyntheticEvent } from "react";

/**
 * 图片/视频加载占位：元素带 `media-placeholder` 时，加载前显示 paper 微光，
 * 加载完（或失败）打上 data-ready 后淡入。用法：
 *   <img className={`${MEDIA} h-full w-full object-cover`} {...imageReady} />
 */
export const MEDIA = "media-placeholder";

function markReady(e: SyntheticEvent<HTMLImageElement | HTMLVideoElement>) {
	e.currentTarget.dataset.ready = e.type === "error" ? "error" : "true";
}

export const imageReady = { onLoad: markReady, onError: markReady };
export const videoReady = { onLoadedData: markReady, onError: markReady };
