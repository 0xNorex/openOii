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
export function useRunState(projectId: number): RunState {
	const { data } = useQuery({
		queryKey: projectQueryKeys.runState(projectId),
		enabled: projectId > 0,
		retry: 1,
		queryFn: async () => {
			const seq = lifecycleSeq.get(projectId) ?? 0;
			const control = await projectsApi.currentRun(projectId);
			const live = readRunState(projectId);
			if ((lifecycleSeq.get(projectId) ?? 0) !== seq) return live;
			return { ...reconcileRunState(live, control ?? null), revision: live.revision + 1 };
		},
		staleTime: 0,
		refetchOnWindowFocus: true,
	});
	return data ?? readRunState(projectId);
}
