import { appQueryClient } from "./client";
import { projectQueryKeys } from "./queryKeys";

/** 用服务端真相重建运行态；终态或用户操作后项目状态（失败/完成）也一起刷新。 */
export function resyncRunState(projectId: number, { project = false } = {}): void {
	void appQueryClient.invalidateQueries({ queryKey: projectQueryKeys.runState(projectId) });
	if (project) void appQueryClient.invalidateQueries({ queryKey: projectQueryKeys.project(projectId) });
}
