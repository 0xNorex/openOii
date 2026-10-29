import { useSyncExternalStore } from "react";

/**
 * 每个项目的 WS 连接状态与最后一次收到事件的时间。
 * 只给「最后更新 N 秒前 / 连接中断」提示用，不参与运行态推导。
 */
export type WsLinkState = "connecting" | "open" | "closed";

export interface ConnectionStatus {
	state: WsLinkState;
	/** 最近一次收到服务端事件或完成校准的时间（ms） */
	lastEventAt: number | null;
}

const INITIAL: ConnectionStatus = { state: "connecting", lastEventAt: null };
const statuses = new Map<number, ConnectionStatus>();
const listeners = new Set<() => void>();

function emit() {
	for (const listener of listeners) listener();
}

export function readConnectionStatus(projectId: number): ConnectionStatus {
	return statuses.get(projectId) ?? INITIAL;
}

export function setConnectionState(projectId: number, state: WsLinkState): void {
	const current = readConnectionStatus(projectId);
	if (current.state === state) return;
	statuses.set(projectId, { ...current, state });
	emit();
}

export function noteServerActivity(projectId: number, at: number = Date.now()): void {
	const current = readConnectionStatus(projectId);
	// 每秒最多通知一次，避免流式帧把整棵树刷新
	if (current.lastEventAt !== null && at - current.lastEventAt < 1000) {
		statuses.set(projectId, { ...current, lastEventAt: current.lastEventAt });
		return;
	}
	statuses.set(projectId, { ...current, lastEventAt: at });
	emit();
}

function subscribe(listener: () => void) {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function useConnectionStatus(projectId: number): ConnectionStatus {
	return useSyncExternalStore(
		subscribe,
		() => readConnectionStatus(projectId),
		() => INITIAL,
	);
}

/** 测试用 */
export function resetConnectionStatuses(): void {
	statuses.clear();
	emit();
}
