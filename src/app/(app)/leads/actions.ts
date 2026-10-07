"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireActor, requireActorArea } from "@/lib/server/rbac";
import { logActivity } from "@/lib/server/activity";
import { refreshLeadExtras, runAssignUnassigned, runSync } from "@/lib/server/leads";
import { LEAD_STATUS } from "@/lib/labels";
import type { Lead, LeadStatus, PipelineType } from "@/lib/types";

function s(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  if (v == null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ---------------------------------------------------------------------------
// Change status / setter / notes on one lead (used by the list and detail page)
// ---------------------------------------------------------------------------
export async function updateLead(formData: FormData) {
  const actor = await requireActor();
  const supabase = await getServerSupabase();
  const id = s(formData, "id");
  if (!id || !UUID.test(id)) throw new Error("Missing lead id");

  const { data: before } = await supabase
    .from("leads")
    .select("status, setter_id, notes")
    .eq("id", id)
    .maybeSingle();
  if (!before) throw new Error("Lead not found");

  const patch: Record<string, unknown> = {};
  const events: { kind: string; summary: string }[] = [];

  if (formData.has("status")) {
    const st = s(formData, "status") as LeadStatus | null;
    if (!st || !(st in LEAD_STATUS)) throw new Error("Invalid status");
    if (st !== before.status) {
      patch.status = st;
      events.push({
        kind: "status",
        summary: `Status: ${LEAD_STATUS[before.status as LeadStatus].label} → ${LEAD_STATUS[st].label}`,
      });
    }
  }

  if (formData.has("setter_id")) {
    const sid = s(formData, "setter_id");
    if (sid && !UUID.test(sid)) throw new Error("Invalid setter");
    if (sid !== before.setter_id) {
      const { data: setters } = await supabase.from("setters").select("id, name");
      const nameOf = (x: string | null) => (setters ?? []).find((t) => t.id === x)?.name ?? "Unassigned";
      patch.setter_id = sid;
      patch.assigned_at = sid ? new Date().toISOString() : null;
      patch.assigned_by = actor.full_name || actor.email;
      events.push({
        kind: before.setter_id ? "reassigned" : "assigned",
        summary: `Setter: ${nameOf(before.setter_id)} → ${nameOf(sid)}`,
      });
    }
  }

  if (formData.has("notes")) {
    const notes = s(formData, "notes");
    if (notes !== (before.notes ?? null)) {
      patch.notes = notes;
      events.push({ kind: "note", summary: "Notes updated" });
    }
  }

  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase.from("leads").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  if (events.length) {
    await supabase
      .from("lead_events")
      .insert(events.map((e) => ({ lead_id: id, kind: e.kind, summary: e.summary, actor_id: actor.id })));
  }

  revalidatePath("/leads");
  revalidatePath(`/leads/${id}`);
}

// ---------------------------------------------------------------------------
// Sheet columns kept on the lead: Name of Ads / Code (typed in) and country
// ---------------------------------------------------------------------------
export async function updateLeadAd(formData: FormData) {
  const actor = await requireActor();
  const supabase = await getServerSupabase();
  const id = s(formData, "id");
  if (!id || !UUID.test(id)) throw new Error("Missing lead id");
  const patch = {
    ad_name: s(formData, "ad_name")?.slice(0, 200) ?? null,
    ad_code: s(formData, "ad_code")?.slice(0, 60) ?? null,
    country: s(formData, "country")?.slice(0, 60) ?? null,
  };
  const { error } = await supabase.from("leads").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  await supabase.from("lead_events").insert({
    lead_id: id,
    kind: "note",
    summary: `Ad details: ${[patch.ad_name, patch.ad_code, patch.country].filter(Boolean).join(" · ") || "cleared"}`,
    actor_id: actor.id,
  });
  revalidatePath(`/leads/${id}`);
}

/** Re-read the intake form and AI call notes from GHL now (read-only). */
export async function refreshExtras(formData: FormData) {
  await requireActorArea("leads");
  const supabase = await getServerSupabase();
  const id = s(formData, "id");
  if (!id || !UUID.test(id)) throw new Error("Missing lead id");
  const { data } = await supabase.from("leads").select("id, ghl_contact_id, extras_synced_at").eq("id", id).maybeSingle();
  if (data) await refreshLeadExtras(data as { id: string; ghl_contact_id: string | null; extras_synced_at: string | null }, true);
  revalidatePath(`/leads/${id}`);
}

// ---------------------------------------------------------------------------
// Allocation controls
// ---------------------------------------------------------------------------
export async function toggleSetter(formData: FormData) {
  await requireActorArea("leads", "manager");
  const supabase = await getServerSupabase();
  const id = s(formData, "id");
  if (!id || !UUID.test(id)) throw new Error("Missing setter id");
  const active = s(formData, "active") === "true";
  const { error } = await supabase.from("setters").update({ active }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/leads");
}

/** Admin: turn allocation on. Leads created from now on are assigned; older ones stay "history". */
export async function startAllocating() {
  await requireActorArea("leads", "admin");
  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("lead_settings")
    .update({ live_from: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", 1)
    .is("live_from", null);
  if (error) throw new Error(error.message);
  revalidatePath("/leads");
}

export async function syncNow() {
  await requireActorArea("leads");
  const r = await runSync(3);
  const msg =
    "error" in r
      ? r.error
      : `Synced from GHL: ${r.created} new, ${r.updated} refreshed${r.errors.length ? `, ${r.errors.length} error(s): ${r.errors[0]}` : ""}`;
  revalidatePath("/leads");
  redirect(`/leads?msg=${encodeURIComponent(msg)}`);
}

export async function assignUnassignedNow() {
  await requireActorArea("leads", "manager");
  const n = await runAssignUnassigned();
  revalidatePath("/leads");
  redirect(`/leads?msg=${encodeURIComponent(`Assigned ${n} unassigned lead${n === 1 ? "" : "s"}`)}`);
}

// ---------------------------------------------------------------------------
// Convert a won lead into a client in the onboarding pipeline
// ---------------------------------------------------------------------------
export async function convertLead(formData: FormData) {
  const actor = await requireActor();
  const supabase = await getServerSupabase();
  const id = s(formData, "id");
  if (!id || !UUID.test(id)) throw new Error("Missing lead id");

  const { data } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
  const lead = data as Lead | null;
  if (!lead) throw new Error("Lead not found");
  if (lead.client_id) redirect(`/clients/${lead.client_id}`);

  // VA and Premium VA leads start the VA pipeline; AI leads the AI receptionist onboarding.
  if (lead.service === "unknown") throw new Error("Set whether this lead is AI or VA first, then convert it.");
  const pipeline: PipelineType = lead.service === "va" || lead.service === "premium" ? "va" : "ai";
  const { data: firstStage } = await supabase
    .from("pipeline_stages")
    .select("id")
    .eq("pipeline", pipeline)
    .order("position")
    .limit(1)
    .maybeSingle();

  let closedBy: string | null = null;
  if (lead.setter_id) {
    const { data: setter } = await supabase.from("setters").select("name").eq("id", lead.setter_id).maybeSingle();
    closedBy = setter?.name ?? null;
  }

  const name = lead.name || lead.email || lead.phone || "New client";
  const { data: client, error } = await supabase
    .from("clients")
    .insert({
      pipeline,
      name,
      contact_email: lead.email,
      source: lead.source,
      closed_by: closedBy,
      stage_id: firstStage?.id ?? null,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const { data: templates } = await supabase
    .from("checklist_templates")
    .select("key, label, position")
    .eq("pipeline", pipeline)
    .order("position");
  if (templates?.length) {
    await supabase.from("checklist_items").insert(
      templates.map((t) => ({ client_id: client.id, key: t.key, label: t.label, position: t.position })),
    );
  }

  await supabase.from("leads").update({ client_id: client.id, status: "won" }).eq("id", id);
  await supabase.from("lead_events").insert({
    lead_id: id,
    kind: "converted",
    summary: "Converted to an AI receptionist client",
    actor_id: actor.id,
  });
  await logActivity({
    entity: "client",
    entityId: client.id,
    verb: "created",
    summary: `Created ${name} from a lead`,
  });

  revalidatePath("/leads");
  revalidatePath("/pipeline");
  redirect(`/clients/${client.id}`);
}
