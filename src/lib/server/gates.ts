import "server-only";
import { getServerSupabase } from "@/lib/supabase/server";
import type { ChecklistItem, PipelineStage, StageGate } from "@/lib/types";

export interface GateCheck {
  allowed: boolean;
  blockedBy: string[]; // human-readable labels of unmet gates
}

function evaluate(
  targetStageId: string,
  stages: PipelineStage[],
  gates: StageGate[],
  checklist: ChecklistItem[],
): GateCheck {
  const target = stages.find((s) => s.id === targetStageId);
  if (!target) return { allowed: true, blockedBy: [] };
  // only gates from the target's own pipeline (VA rules never block AI clients and vice versa)
  const stagePos = new Map(stages.filter((s) => s.pipeline === target.pipeline).map((s) => [s.id, s.position]));
  const itemsByKey = new Map(checklist.map((c) => [c.key, c]));

  const blockedBy: string[] = [];
  for (const g of gates) {
    const gatePos = stagePos.get(g.stage_id);
    if (gatePos == null || gatePos >= target.position) continue;
    const item = itemsByKey.get(g.required_checklist_key);
    if (!item || item.status !== "done") {
      blockedBy.push(item?.label ?? g.required_checklist_key);
    }
  }
  return { allowed: blockedBy.length === 0, blockedBy };
}

/** Single-stage check (used by the move action). */
export async function checkStageGate(
  clientId: string,
  targetStageId: string,
): Promise<GateCheck> {
  const supabase = await getServerSupabase();
  const [{ data: stages }, { data: gates }, { data: checklist }] = await Promise.all([
    supabase.from("pipeline_stages").select("*"),
    supabase.from("stage_gates").select("*"),
    supabase.from("checklist_items").select("*").eq("client_id", clientId),
  ]);
  return evaluate(
    targetStageId,
    (stages as PipelineStage[]) ?? [],
    (gates as StageGate[]) ?? [],
    (checklist as ChecklistItem[]) ?? [],
  );
}

/**
 * All target stages at once — one set of rows, evaluated in memory.
 * Pass the data you already loaded on the page to avoid extra round-trips.
 */
export function checkAllStageGates(
  stages: PipelineStage[],
  gates: StageGate[],
  checklist: ChecklistItem[],
): Map<string, GateCheck> {
  return new Map(stages.map((s) => [s.id, evaluate(s.id, stages, gates, checklist)]));
}
