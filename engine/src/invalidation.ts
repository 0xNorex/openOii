import { STAGE_ORDER, type StageId } from "./contract.js";
import type { SharedDb } from "./shared-db.js";

export interface RerunIntent {
  version: number;
  start_stage: string;
  scope: {
    entity_type: "character" | "shot" | null;
    entity_ids: number[];
  };
}

/** Resolve the rerun entry stage; media stays available until replacement succeeds. */
export function applyInvalidationPlan(
  shared: SharedDb,
  projectId: number,
  intent: RerunIntent,
): StageId {
  void shared;
  void projectId;
  if (intent.version !== 1) throw new Error(`unsupported rerun intent version ${intent.version}`);
  return (STAGE_ORDER as readonly string[]).includes(intent.start_stage)
    ? (intent.start_stage as StageId)
    : "plan_outline";
}
