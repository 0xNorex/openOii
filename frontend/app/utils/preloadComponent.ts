import { useEffect, useState, type ComponentType } from "react";

type AnyComponent = ComponentType<never>;

export interface PreloadedComponent<C extends AnyComponent> {
	/** 已加载好的组件；未就绪时为 null */
	current: C | null;
	/** 开始（或复用）加载；重复调用只会发一次请求 */
	load: () => Promise<C>;
}

export function onIdle(fn: () => void): void {
	if (typeof window === "undefined") return;
	if (typeof window.requestIdleCallback === "function") {
		window.requestIdleCallback(fn, { timeout: 2000 });
	} else {
		window.setTimeout(fn, 1);
	}
}

/**
 * 拆成独立 chunk 但不产生瀑布：调用方提前 load()（和路由 chunk 并行），
 * 渲染时已就绪就同步拿到组件（没有 Suspense 闪烁），否则加载完再挂。
 */
export function preloadComponent<C extends AnyComponent>(
	loader: () => Promise<C>,
): PreloadedComponent<C> {
	let pending: Promise<C> | null = null;
	const slot: PreloadedComponent<C> = {
		current: null,
		load: () => {
			pending ??= loader().then(
				(component) => {
					slot.current = component;
					return component;
				},
				(error: unknown) => {
					// 失败后允许下次使用时重试
					pending = null;
					throw error;
				},
			);
			return pending;
		},
	};
	return slot;
}

export function usePreloadedComponent<C extends AnyComponent>(
	slot: PreloadedComponent<C>,
	enabled = true,
): C | null {
	const [component, setComponent] = useState<C | null>(() => slot.current);
	useEffect(() => {
		if (!enabled || component) return;
		let alive = true;
		slot.load().then(
			(loaded) => {
				// 组件本身是函数，必须包一层，避免被当成 updater 调用
				if (alive) setComponent(() => loaded);
			},
			() => {},
		);
		return () => {
			alive = false;
		};
	}, [enabled, component, slot]);
	return component ?? slot.current;
}
