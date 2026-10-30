import { useQuery } from "@tanstack/react-query";
import { projectQueryKeys } from "~/query/queryKeys";
import { readRunState, reconcileRunState, type RunState } from "~/query/runState";
import { projectsApi } from "~/services/api";

/**
 * 运行生命周期事件计数（run_started / awaiting / confirmed / feedback / 终态）。
 * 校准请求在途时如果来了这类事件，返回的快照可能比 WS 旧——丢掉它，
 * 事件处理会再触发一次校准。
 */
const lifecycleSeq = new Map<number, number>();

export function noteRunLifecycleEvent(projectId: number): void {
	lifecycleSeq.set(projectId, (lifecycleSeq.get(projectId) ?? 0) + 1);
}

/**
 * Reactive read of the live run UI projection.
 *
 * 每次取数都用 runs/current（+ 闸门载荷）重建：服务端是真相，WS 只是通知。
 * 页面加载、WS 重连、用户操作结束、生命周期事件后都会失效重取。
 */
/**
 * 停在审批闸门时没有 WS 事件可等：引擎这时重启（心跳没了）也不会有人通知。
 * 每 30 秒问一次 runs/current，服务端发现执行引擎已换人就会把运行标成可恢复，
 * 不用等 2 分钟的租约过期。
 */
export const GATE_POLL_MS = 30_000;

export function runStateRefetchInterval(state: RunState | undefined): number | false {
	return state?.awaitingConfirm ? GATE_POLL_MS : false;
}

function runStateQueryOptions(projectId: number) {
	return {
		queryKey: projectQueryKeys.runState(projectId),
		enabled: projectId > 0,
		retry: 1,
		queryFn: async (): Promise<RunState> => {
			const seq = lifecycleSeq.get(projectId) ?? 0;
			const control = await projectsApi.currentRun(projectId);
			const live = readRunState(projectId);
			if ((lifecycleSeq.get(projectId) ?? 0) !== seq) return live;
			return { ...reconcileRunState(live, control ?? null), revision: live.revision + 1 };
		},
		staleTime: 0,
		refetchOnWindowFocus: true,
		refetchInterval: (query: { state: { data: RunState | undefined } }) =>
			runStateRefetchInterval(query.state.data),
	};
}

export function useRunState(projectId: number): RunState {
	const { data } = useQuery(runStateQueryOptions(projectId));
	return data ?? readRunState(projectId);
}

/**
 * Subscribe to a slice of the run projection. `select` output is structurally
 * shared by React Query, so a component only re-renders when its slice changes
 * — not on every `llm_stream` frame. Pass a module-level (stable) selector.
 */
export function useRunStateSelect<T>(projectId: number, select: (state: RunState) => T): T {
	const { data } = useQuery({ ...runStateQueryOptions(projectId), select });
	return data ?? select(readRunState(projectId));
}
