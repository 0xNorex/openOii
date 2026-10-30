import { useEffect, useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import { projectQueryKeys } from "~/query/queryKeys";
import { projectsApi } from "~/services/api";
import { liveRunTiming, type LiveRunTiming } from "~/utils/runTiming";
import {
	isRunNotifyEnabled,
	notificationAvailability,
	runNotificationsVersion,
	subscribeRunNotifications,
	toggleRunNotify,
	type NotifyAvailability,
} from "~/utils/runNotifications";
import { useRunStateSelect } from "./useRunState";
import type { RunState } from "~/query/runState";

/** 服务端每步一刷（换步 / 到闸门时），中间每分钟校准一次；秒表在本地走 */
export const RUN_TIMING_REFRESH_MS = 60_000;

function useNow(active: boolean): number {
	const [now, setNow] = useState(() => Date.now());
	useEffect(() => {
		if (!active) return;
		setNow(Date.now());
		const timer = window.setInterval(() => setNow(Date.now()), 1000);
		return () => window.clearInterval(timer);
	}, [active]);
	return now;
}

const selectTimingRun = (state: RunState) => ({
	currentRunId: state.currentRunId,
	recoveryControl: state.recoveryControl,
	isGenerating: state.isGenerating,
	currentStep: state.currentStep,
	awaitingConfirm: state.awaitingConfirm,
});

export function useRunTiming(projectId: number): LiveRunTiming | null {
	const { currentRunId, recoveryControl, isGenerating, currentStep, awaitingConfirm } = useRunStateSelect(projectId, selectTimingRun);
	const runId = currentRunId ?? recoveryControl?.active_run.id ?? null;
	const enabled = Boolean(isGenerating && runId && runId > 0);
	const query = useQuery({
		queryKey: projectQueryKeys.runTiming(runId ?? 0),
		queryFn: () => projectsApi.runTiming(runId as number),
		enabled,
		staleTime: 0,
		retry: false,
		refetchInterval: enabled ? RUN_TIMING_REFRESH_MS : false,
	});
	const { refetch } = query;
	useEffect(() => {
		if (enabled) void refetch();
	}, [enabled, currentStep, awaitingConfirm, refetch]);
	const now = useNow(enabled);
	if (!enabled || !query.data || query.data.run_id !== runId) return null;
	return liveRunTiming(query.data, query.dataUpdatedAt, now);
}

export interface RunNotifyControl {
	enabled: boolean;
	availability: NotifyAvailability;
	toggle: () => void;
}

export function useRunNotify(projectId: number): RunNotifyControl {
	useSyncExternalStore(subscribeRunNotifications, runNotificationsVersion, runNotificationsVersion);
	return {
		enabled: isRunNotifyEnabled(projectId),
		availability: notificationAvailability(),
		toggle: () => void toggleRunNotify(projectId),
	};
}
