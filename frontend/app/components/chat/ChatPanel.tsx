import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useEditorStore } from "~/stores/editorStore";
import { readMessageFeed } from "~/query/messageFeed";
import { projectQueryKeys } from "~/query/queryKeys";
import { useRunState } from "~/hooks/useRunState";
import { ActivityTimeline } from "~/features/comic-workflow/agent/ActivityTimeline";
import { deriveActivityTimeline } from "~/features/comic-workflow/agent/activityTimeline";
import { Button } from "~/components/ui/Button";
import { AGENT_NAME_MAP, type WorkflowStage } from "~/types";
import {
  LightBulbIcon,
  PaintBrushIcon,
  RocketLaunchIcon,
  StopIcon,
  BoltIcon,
  AdjustmentsHorizontalIcon,
} from "@heroicons/react/24/outline";
import { getWorkflowStageInfo } from "~/utils/workflowStage";
import type { AgentMessage } from "~/types";

/** Stable empty array so the query's fallback does not churn identity. */
const EMPTY_MESSAGES: AgentMessage[] = [];

interface ChatPanelProps {
	projectId: number;
	onConfirm: (feedback?: string) => void;
	onCancel: () => void;
	isGenerating: boolean;
}

function getStageIcon(stage: WorkflowStage) {
  if (stage === "compose") return RocketLaunchIcon;
  if (stage === "render" || stage === "render_approval") return PaintBrushIcon;
  if (stage === "plan" || stage === "plan_approval") return LightBulbIcon;
  return LightBulbIcon;
}

const agentNameMap = AGENT_NAME_MAP;

export function ChatPanel({
	projectId,
	onConfirm,
	onCancel,
	isGenerating,
}: ChatPanelProps) {
  const {
    currentAgent,
    awaitingConfirm,
    currentStage,
  } = useRunState(projectId);

  // The chat feed is server state, so it is read from the query cache rather
  // than mirrored in the UI store (ADR 0007).
  const messages = useQuery({
    queryKey: projectQueryKeys.messageFeed(projectId),
    queryFn: () => readMessageFeed(projectId),
    staleTime: Infinity,
  }).data ?? EMPTY_MESSAGES;

  const setRunMode = useEditorStore((s) => s.setRunMode);
  const entries = useMemo(
    () => deriveActivityTimeline(messages, { running: isGenerating && !awaitingConfirm }),
    [messages, isGenerating, awaitingConfirm],
  );

  const fallbackStage = currentStage || "plan";
  const info = getWorkflowStageInfo(fallbackStage) ?? {
    title: "规划阶段",
    description: "正在生成剧本、角色与镜头规划",
  };
  const StageIcon = getStageIcon(fallbackStage);
  const runMode = useEditorStore((s) => s.runMode);
  const isYolo = runMode === "yolo";

  const handleRunModeToggle = () => {
    const nextMode = isYolo ? "manual" : "yolo";
    setRunMode(nextMode);
    if (nextMode === "yolo" && awaitingConfirm) {
      onConfirm(undefined);
    }
  };

	return (
		<div className="flex h-full flex-col bg-paper-100" data-shell="activity-feed">
      <div className="flex items-center justify-between border-b border-ink/10 px-2 py-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <StageIcon className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden="true" />
          <span className="truncate text-xs font-bold">
            {info.title}
          </span>
        </div>

		<Button
			onClick={handleRunModeToggle}
			variant={isYolo ? "primary" : "ghost"}
		size="sm"
			className="h-8 min-h-8 border-2 px-2 text-xs font-bold"
			aria-label={isYolo ? "切换逐步确认" : "切换自动确认"}
			title={isYolo ? "自动确认：阶段自动通过" : "逐步确认：每个阶段由你确认"}
		>
          {isYolo ? (
            <>
              <BoltIcon className="h-3.5 w-3.5" aria-hidden="true" />
				  自动
            </>
          ) : (
            <>
              <AdjustmentsHorizontalIcon className="h-3.5 w-3.5" aria-hidden="true" />
				  逐步
            </>
          )}
		</Button>
      </div>

      {isGenerating && !awaitingConfirm && (
        <div className="flex items-center justify-between border-b border-ink/10 px-2 py-0.5">
          <div className="flex items-center gap-1.5 text-xs text-ink-muted">
			<span className="h-2 w-2 animate-pulse rounded-full bg-primary" aria-hidden="true" />
            {agentNameMap[currentAgent || ""] || currentAgent || "处理中"}…
            {isYolo && (
				<span className="inline-flex items-center gap-0.5 rounded-full border border-primary/30 px-1.5 text-xs text-primary">
                <BoltIcon className="h-2 w-2" aria-hidden="true" /> 快速
              </span>
            )}
          </div>
          <Button
            size="sm"
            variant="ghost"
            onClick={onCancel}
            className="h-8 min-h-8 gap-1 px-2 text-error-fg hover:bg-error/10"
            aria-label="停止生成"
          >
            <StopIcon className="h-3.5 w-3.5" aria-hidden="true" /> 停止
          </Button>
        </div>
      )}

      {entries.length === 0 && !isGenerating ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-3 text-center">
          <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full border-2 border-primary/30 bg-primary/10">
            <StageIcon className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          </div>
          <p className="m-0 text-xs text-ink-muted">
            暂无活动记录
          </p>
        </div>
      ) : (
        <ActivityTimeline entries={entries} />
      )}

    </div>
  );
}
