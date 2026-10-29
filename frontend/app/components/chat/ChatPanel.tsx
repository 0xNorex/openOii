import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useEditorStore } from "~/stores/editorStore";
import { readMessageFeed } from "~/query/messageFeed";
import { projectQueryKeys } from "~/query/queryKeys";
import { useRunState } from "~/hooks/useRunState";
import { ActivityTimeline } from "~/features/comic-workflow/agent/ActivityTimeline";
import { deriveActivityTimeline } from "~/features/comic-workflow/agent/activityTimeline";
import { Button } from "~/components/ui/Button";
import { AGENT_NAME_MAP } from "~/types";
import { formatStep, stepForStage } from "~/utils/workflowSteps";
import type { AgentMessage } from "~/types";
import { SvgIcon, type IconName } from "~/components/ui/SvgIcon";
import { SyncStatus } from "~/features/comic-workflow/agent/SyncStatus";
import { resyncRunState } from "~/query/resyncRunState";
import { projectsApi } from "~/services/api";

/** Stable empty array so the query's fallback does not churn identity. */
const EMPTY_MESSAGES: AgentMessage[] = [];

interface ChatPanelProps {
	projectId: number;
	onCancel: () => void;
	isGenerating: boolean;
	/** Only show the newest N entries (mobile summary). */
	limit?: number;
}

/** 六步：前三步是文字（规划），后两步出图，最后合成视频；没有运行时是活动记录 */
function getStepIcon(index: number | null): IconName {
  if (index === null) return "book-open";
  if (index >= 5) return "render";
  if (index >= 3) return "brush";
  return "lightbulb";
}

const agentNameMap = AGENT_NAME_MAP;

export function ChatPanel({
	projectId,
	onCancel,
	isGenerating,
	limit,
}: ChatPanelProps) {
  const {
    currentAgent,
    awaitingConfirm,
    currentStep,
    liveStream,
    feedbackReceipt,
    syncedAt,
    startingRun,
  } = useRunState(projectId);

  // The chat feed is server state, so it is read from the query cache rather
  // than mirrored in the UI store (ADR 0007).
  const messages = useQuery({
    queryKey: projectQueryKeys.messageFeed(projectId),
    queryFn: () => readMessageFeed(projectId),
    staleTime: Infinity,
  }).data ?? EMPTY_MESSAGES;

  // 消息里只有分镜的数据库 id：用分镜列表把它换成对外的 S01/S02
  const shots = useQuery({
    queryKey: projectQueryKeys.shots(projectId),
    queryFn: () => projectsApi.getShots(projectId),
    enabled: projectId > 0,
  }).data;
  const shotOrderById = useMemo(() => new Map((shots ?? []).map((shot) => [shot.id, shot.order])), [shots]);

  const entries = useMemo(() => {
    // 回执出现时已经落进消息流（排在重做输出之前），这里就地换成最新状态；
    // 只有还没归档的（极少数，例如运行态先于消息流恢复）才补在末尾
    const receiptId = feedbackReceipt ? `receipt_${feedbackReceipt.id}` : null;
    let feed: AgentMessage[] = messages;
    if (feedbackReceipt) {
      const archived = messages.some((msg) => msg.id === receiptId);
      feed = archived
        ? messages.map((msg) => (msg.id === receiptId ? { ...msg, receipt: feedbackReceipt } : msg))
        : [
            ...messages,
            {
              id: receiptId ?? undefined,
              agent: "system",
              role: "feedback",
              content: feedbackReceipt.content,
              receipt: feedbackReceipt,
            },
          ];
    }
    const all = deriveActivityTimeline(feed, { running: isGenerating && !awaitingConfirm, shotOrderById });
    return limit ? all.slice(-limit) : all;
  }, [messages, feedbackReceipt, isGenerating, awaitingConfirm, limit, shotOrderById]);

  // 标题跟状态胶囊同一套步骤名；没有运行（含已完成）时不再挂着「规划阶段」
  const step = isGenerating ? stepForStage(currentStep) : null;
  const headerTitle = step ? (awaitingConfirm ? `${step.label} · 待确认` : formatStep(step)) : "活动记录";
  const stageIcon = getStepIcon(step?.index ?? null);
  const workingOn =
    currentAgent === "critic" ? "质量审查" : step?.label || agentNameMap[currentAgent || ""] || currentAgent || "处理中";
  const runMode = useEditorStore((s) => s.runMode);
  const isYolo = runMode === "yolo";


	return (
		<div className="flex h-full flex-col bg-paper-100" data-shell="activity-feed">
      <div className="flex items-center justify-between border-b border-line px-2 py-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <SvgIcon name={stageIcon} size={14} className="shrink-0 text-primary" />
          <span className="truncate text-xs font-bold">
            {headerTitle}
          </span>
        </div>
        <SyncStatus
          projectId={projectId}
          syncedAt={syncedAt}
          expectingEvents={isGenerating && !awaitingConfirm}
          onResync={() => resyncRunState(projectId, { project: true })}
        />
      </div>

      {isGenerating && !awaitingConfirm && (
        <div className="flex items-center justify-between border-b border-line px-2 py-0.5">
          <div className="flex items-center gap-1.5 text-xs text-ink-muted">
			<span className="h-2 w-2 animate-pulse rounded-full bg-primary" aria-hidden="true" />
            {workingOn}…
            {isYolo && (
				<span className="inline-flex items-center gap-0.5 rounded-full border border-primary/30 px-1.5 text-xs text-primary">
                <SvgIcon name="zap" size={8} /> 快速
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
            <SvgIcon name="stop" size={14} /> 停止
          </Button>
        </div>
      )}

      {startingRun && !isGenerating ? (
        <div
          className="flex items-center gap-2 border-b border-line px-3 py-2 text-xs text-ink-muted"
          role="status"
          data-testid="run-starting"
        >
          <span className="spinner-doodle h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          正在创建运行…首次检查模型服务可能要几秒
        </div>
      ) : null}

      {startingRun && !isGenerating ? null : entries.length === 0 && !isGenerating && !liveStream ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-3 text-center">
          <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-full border border-primary/30 bg-primary/10">
            <SvgIcon name={stageIcon} size={14} className="text-primary" />
          </div>
          <p className="m-0 text-xs text-ink-muted">
            暂无活动记录
          </p>
        </div>
      ) : (
        <ActivityTimeline entries={entries} live={liveStream} />
      )}

    </div>
  );
}
