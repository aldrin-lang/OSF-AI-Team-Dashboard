"use server";

import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireActor } from "@/lib/server/rbac";
import { getProfiles, getStages, getStageGates } from "@/lib/data/queries";
import { checkAllStageGates } from "@/lib/server/gates";
import { logActivity } from "@/lib/server/activity";
import { nextAction, assessRisk } from "@/lib/insights";
import type {
  ActivityRow,
  ChecklistItem,
  Client,
  ClientLine,
} from "@/lib/types";

export interface ClientQuick {
  client: Client;
  lines: ClientLine[];
  checklist: ChecklistItem[];
  stages: { id: string; name: string; allowed: boolean; blockedBy: string[] }[];
  managers: { id: string; name: string }[];
  activity: ActivityRow[];
  openConcerns: number;
  nextAction: { label: string; tone: string };
  risk: { level: "ok" | "watch" | "risk"; reasons: string[] };
}

export async function getClientQuick(id: string): Promise<ClientQuick | null> {
  await requireActor();
  const supabase = await getServerSupabase();

  const { data: client } = await supabase.from("clients").select("*").eq("id", id).maybeSingle();
  if (!client) return null;

  const [
    { data: lines },
    { data: checklist },
    { data: activity },
    { count: openConcerns },
    profiles,
    everyStage,
    gates,
  ] = await Promise.all([
    supabase.from("client_lines").select("*").eq("client_id", id).order("created_at"),
    supabase.from("checklist_items").select("*").eq("client_id", id).order("position"),
    supabase
      .from("activity_log")
      .select("*")
      .eq("entity", "client")
      .eq("entity_id", id)
      .order("created_at", { ascending: false })
      .limit(8),
    supabase
      .from("concerns")
      .select("id", { count: "exact", head: true })
      .eq("client_id", id)
      .neq("status", "resolved"),
    getProfiles(),
    getStages(),
    getStageGates(),
  ]);

  const cl = (checklist as ChecklistItem[]) ?? [];
  const ln = (lines as ClientLine[]) ?? [];
  // only the stages of this client's own pipeline (VA or AI)
  const allStages = everyStage.filter((st) => st.pipeline === (client as Client).pipeline);
  const gateMap = checkAllStageGates(allStages, gates, cl);
  const stage = allStages.find((s) => s.id === (client as Client).stage_id) ?? null;

  return {
    client: client as Client,
    lines: ln,
    checklist: cl,
    stages: allStages.map((s) => ({
      id: s.id,
      name: s.name,
      allowed: gateMap.get(s.id)?.allowed ?? true,
      blockedBy: gateMap.get(s.id)?.blockedBy ?? [],
    })),
    managers: profiles.map((p) => ({ id: p.id, name: p.full_name || p.email })),
    activity: (activity as ActivityRow[]) ?? [],
    openConcerns: openConcerns ?? 0,
    nextAction: nextAction(client as Client, stage, cl, ln),
    risk: assessRisk(client as Client, stage, openConcerns ?? 0),
  };
}

// ---------------------------------------------------------------------------
// Lightweight field updates used by the pipeline quick-view drawer
// ---------------------------------------------------------------------------
export async function quickSetField(input: {
  clientId: string;
  field: "manager_id" | "status";
  value: string | null;
}) {
  await requireActor();
  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("clients")
    .update({ [input.field]: input.value || null })
    .eq("id", input.clientId);
  if (error) throw new Error(error.message);
  await logActivity({
    entity: "client",
    entityId: input.clientId,
    verb: "updated",
    summary: `${input.field === "manager_id" ? "Manager" : "Status"} changed`,
  });
  revalidatePath("/pipeline");
  revalidatePath(`/clients/${input.clientId}`);
  revalidatePath("/clients");
}

export async function quickSaveLine(input: {
  clientId: string;
  lineId?: string;
  label: string | null;
  ai_phone_number: string | null;
}) {
  await requireActor();
  const supabase = await getServerSupabase();
  const row = {
    label: input.label?.trim() || null,
    ai_phone_number: input.ai_phone_number?.trim() || null,
  };
  if (input.lineId) {
    const { error } = await supabase.from("client_lines").update(row).eq("id", input.lineId);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase
      .from("client_lines")
      .insert({ ...row, client_id: input.clientId });
    if (error) throw new Error(error.message);
  }
  await logActivity({
    entity: "client",
    entityId: input.clientId,
    verb: "line",
    summary: input.lineId
      ? `Updated AI phone ${row.label || row.ai_phone_number || ""}`.trim()
      : `Added AI phone ${row.label || row.ai_phone_number || ""}`.trim(),
  });
  revalidatePath("/pipeline");
  revalidatePath(`/clients/${input.clientId}`);
}

export async function quickDeleteLine(input: { clientId: string; lineId: string }) {
  await requireActor();
  const supabase = await getServerSupabase();
  const { error } = await supabase.from("client_lines").delete().eq("id", input.lineId);
  if (error) throw new Error(error.message);
  await logActivity({
    entity: "client",
    entityId: input.clientId,
    verb: "line",
    summary: "Removed an AI phone",
  });
  revalidatePath("/pipeline");
  revalidatePath(`/clients/${input.clientId}`);
}

export async function quickSetRb(input: {
  clientId: string;
  lineId: string;
  value: string;
}) {
  await requireActor();
  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("client_lines")
    .update({ regulatory_bundle_status: input.value })
    .eq("id", input.lineId);
  if (error) throw new Error(error.message);
  await logActivity({
    entity: "client",
    entityId: input.clientId,
    verb: "line",
    summary: `Regulatory Bundle → ${input.value.replace(/_/g, " ")}`,
  });
  revalidatePath("/pipeline");
  revalidatePath(`/clients/${input.clientId}`);
}

export async function quickAddNote(input: { clientId: string; body: string }) {
  const actor = await requireActor();
  if (!input.body.trim()) return;
  const supabase = await getServerSupabase();
  await supabase.from("comments").insert({
    entity: "client",
    entity_id: input.clientId,
    author_id: actor.id,
    body: input.body.trim(),
  });
  await logActivity({
    entity: "client",
    entityId: input.clientId,
    verb: "comment",
    summary: input.body.length > 90 ? `${input.body.slice(0, 90)}…` : input.body,
  });
  revalidatePath("/pipeline");
  revalidatePath(`/clients/${input.clientId}`);
}
