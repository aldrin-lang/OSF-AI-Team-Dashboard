import "server-only";
import { getServerSupabase } from "@/lib/supabase/server";
import type { ChecklistItem, PipelineStage, StageGate } from "@/lib/types";

export interface GateCheck {
  allowed: boolean;
  blockedBy: string[]; // human-readable labels of unmet gates
}

/**
 * A client may move to `targetStageId` only if every stage_gate attached to a
 * stage positioned *before* the target has its checklist item marked `done`.
 */
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

  const stageList = (stages as PipelineStage[]) ?? [];
  const target = stageList.find((s) => s.id === targetStageId);
  if (!target) return { allowed: true, blockedBy: [] };

  const stagePos = new Map(stageList.map((s) => [s.id, s.position]));
  const itemsByKey = new Map(
    ((checklist as ChecklistItem[]) ?? []).map((c) => [c.key, c]),
  );

  const blockedBy: string[] = [];
  for (const g of (gates as StageGate[]) ?? []) {
    const gatePos = stagePos.get(g.stage_id);
    if (gatePos == null || gatePos >= target.position) continue;
    const item = itemsByKey.get(g.required_checklist_key);
    if (!item || item.status !== "done") {
      blockedBy.push(item?.label ?? g.required_checklist_key);
    }
  }

  return { allowed: blockedBy.length === 0, blockedBy };
}
