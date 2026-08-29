"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireActor } from "@/lib/server/rbac";
import { logActivity, diff } from "@/lib/server/activity";
import { checkStageGate } from "@/lib/server/gates";
import { notifyUsers } from "@/lib/server/notify";
import type { Client, PipelineType } from "@/lib/types";

function s(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  if (v == null) return null;
  const t = String(v).trim();
  return t === "" ? null : t;
}
function num(fd: FormData, k: string): number | null {
  const v = s(fd, k);
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Create a client (+ seed its checklist from the pipeline template)
// ---------------------------------------------------------------------------
export async function createClient(formData: FormData) {
  await requireActor();
  const supabase = await getServerSupabase();

  const pipeline = (s(formData, "pipeline") ?? "ai") as PipelineType;
  const name = s(formData, "name");
  if (!name) throw new Error("Client name is required");

  const { data: firstStage } = await supabase
    .from("pipeline_stages")
    .select("id")
    .eq("pipeline", pipeline)
    .order("position")
    .limit(1)
    .maybeSingle();

  const { data: client, error } = await supabase
    .from("clients")
    .insert({
      pipeline,
      name,
      industry: s(formData, "industry"),
      country: s(formData, "country"),
      source: s(formData, "source"),
      closed_by: s(formData, "closed_by"),
      manager_id: s(formData, "manager_id"),
      demo_call_date: s(formData, "demo_call_date"),
      stage_id: firstStage?.id ?? null,
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  const { data: templates } = await supabase
    .from("checklist_templates")
    .select("key, label, position")
    .eq("pipeline", pipeline)
    .order("position");

  if (templates?.length) {
    await supabase.from("checklist_items").insert(
      templates.map((t) => ({
        client_id: (client as Client).id,
        key: t.key,
        label: t.label,
        position: t.position,
      })),
    );
  }

  await logActivity({
    entity: "client",
    entityId: (client as Client).id,
    verb: "created",
    summary: `Created ${name}`,
  });

  revalidatePath("/clients");
  revalidatePath("/pipeline");
  redirect(`/clients/${(client as Client).id}`);
}

// ---------------------------------------------------------------------------
// Update editable client fields
// ---------------------------------------------------------------------------
const EDITABLE: (keyof Client)[] = [
  "name",
  "industry",
  "country",
  "source",
  "closed_by",
  "manager_id",
  "demo_call_date",
  "start_date",
  "status",
  "remarks",
];
const COMMERCIAL: (keyof Client)[] = [
  "setup_fee",
  "daily_rate",
  "hiring_fee_status",
  "hiring_fee_invoice",
  "hiring_fee_paid",
];

export async function updateClient(formData: FormData) {
  const actor = await requireActor();
  const supabase = await getServerSupabase();
  const id = s(formData, "id");
  if (!id) throw new Error("Missing client id");

  const { data: before } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .single();
  if (!before) throw new Error("Client not found");

  const patch: Record<string, unknown> = {};
  for (const f of EDITABLE) if (formData.has(f)) patch[f] = f === "manager_id" ? s(formData, f) : s(formData, f);
  if (formData.has("setup_fee")) patch.setup_fee = num(formData, "setup_fee");
  if (formData.has("daily_rate")) patch.daily_rate = num(formData, "daily_rate");
  for (const f of ["hiring_fee_status", "hiring_fee_invoice", "hiring_fee_paid"] as const)
    if (formData.has(f)) patch[f] = s(formData, f);

  const changedCommercial = COMMERCIAL.some(
    (f) => f in patch && patch[f as string] !== (before as Client)[f],
  );
  if (changedCommercial && actor.role === "member") {
    throw new Error("Only managers or admins can edit commercial fields");
  }

  const { error } = await supabase.from("clients").update(patch).eq("id", id);
  if (error) throw new Error(error.message);

  const changes = diff(before as Client, patch as Partial<Client>, [...EDITABLE, ...COMMERCIAL]);
  if (Object.keys(changes).length) {
    await logActivity({
      entity: "client",
      entityId: id,
      verb: "updated",
      summary: `Updated ${Object.keys(changes).join(", ")}`,
      changes,
    });
  }

  revalidatePath(`/clients/${id}`);
  revalidatePath("/clients");
}

// ---------------------------------------------------------------------------
// Move a client to another stage (enforces stage gates)
// ---------------------------------------------------------------------------
export async function moveClientStage(input: {
  clientId: string;
  toStageId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const actor = await requireActor();
  const supabase = await getServerSupabase();

  const { data: client } = await supabase
    .from("clients")
    .select("id, name, stage_id, manager_id")
    .eq("id", input.clientId)
    .single();
  if (!client) return { ok: false, error: "Client not found" };
  if (client.stage_id === input.toStageId) return { ok: true };

  const gate = await checkStageGate(input.clientId, input.toStageId);
  if (!gate.allowed) {
    return { ok: false, error: `Blocked — not done: ${gate.blockedBy.join(", ")}` };
  }

  const { data: stages } = await supabase
    .from("pipeline_stages")
    .select("id, name")
    .in("id", [client.stage_id, input.toStageId].filter(Boolean) as string[]);
  const nameOf = (id: string | null) =>
    stages?.find((x) => x.id === id)?.name ?? "—";

  const { error } = await supabase
    .from("clients")
    .update({ stage_id: input.toStageId })
    .eq("id", input.clientId);
  if (error) return { ok: false, error: error.message };

  await logActivity({
    entity: "client",
    entityId: input.clientId,
    verb: "stage_changed",
    summary: `Stage: ${nameOf(client.stage_id)} → ${nameOf(input.toStageId)}`,
    changes: { stage: { from: nameOf(client.stage_id), to: nameOf(input.toStageId) } },
  });

  if (client.manager_id) {
    await notifyUsers({
      userIds: [client.manager_id],
      event: "stage_change_my_client",
      title: `${client.name} moved to ${nameOf(input.toStageId)}`,
      body: `Moved by ${actor.full_name || actor.email}.`,
      link: `/clients/${input.clientId}`,
      exclude: actor.id,
    });
  }

  revalidatePath("/pipeline");
  revalidatePath(`/clients/${input.clientId}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Checklist items
// ---------------------------------------------------------------------------
export async function setChecklistStatus(input: {
  itemId: string;
  clientId: string;
  status: string;
}) {
  const actor = await requireActor();
  const supabase = await getServerSupabase();

  const patch: Record<string, unknown> = { status: input.status };
  if (input.status === "done") {
    patch.completed_at = new Date().toISOString();
    patch.completed_by = actor.id;
  } else {
    patch.completed_at = null;
    patch.completed_by = null;
  }

  const { data: item, error } = await supabase
    .from("checklist_items")
    .update(patch)
    .eq("id", input.itemId)
    .select("label")
    .single();
  if (error) throw new Error(error.message);

  await logActivity({
    entity: "client",
    entityId: input.clientId,
    verb: "checklist",
    summary: `${item.label}: ${input.status}`,
  });
  revalidatePath(`/clients/${input.clientId}`);
}

// ---------------------------------------------------------------------------
// Comments (with @mention notifications)
// ---------------------------------------------------------------------------
export async function addComment(formData: FormData) {
  const actor = await requireActor();
  const supabase = await getServerSupabase();
  const entity = (s(formData, "entity") ?? "client") as "client" | "concern";
  const entityId = s(formData, "entity_id");
  const body = s(formData, "body");
  if (!entityId || !body) return;

  const mentionIds = (formData.getAll("mention") as string[]).filter(Boolean);

  const { error } = await supabase.from("comments").insert({
    entity,
    entity_id: entityId,
    author_id: actor.id,
    body,
    mentions: mentionIds,
  });
  if (error) throw new Error(error.message);

  await logActivity({
    entity,
    entityId,
    verb: "comment",
    summary: body.length > 90 ? `${body.slice(0, 90)}…` : body,
  });

  if (mentionIds.length) {
    const link = entity === "client" ? `/clients/${entityId}` : `/concerns/${entityId}`;
    await notifyUsers({
      userIds: mentionIds,
      event: "mention",
      title: `${actor.full_name || actor.email} mentioned you`,
      body,
      link,
      exclude: actor.id,
    });
  }

  revalidatePath(entity === "client" ? `/clients/${entityId}` : `/concerns/${entityId}`);
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------
export async function addTask(formData: FormData) {
  const actor = await requireActor();
  const supabase = await getServerSupabase();
  const clientId = s(formData, "client_id");
  const title = s(formData, "title");
  if (!title) return;

  const assignee = s(formData, "assignee_id");
  const { error } = await supabase.from("tasks").insert({
    client_id: clientId,
    title,
    notes: s(formData, "notes"),
    assignee_id: assignee,
    due_date: s(formData, "due_date"),
    created_by: actor.id,
  });
  if (error) throw new Error(error.message);

  if (clientId) {
    await logActivity({ entity: "client", entityId: clientId, verb: "task", summary: `Task: ${title}` });
  }
  if (assignee && assignee !== actor.id) {
    await notifyUsers({
      userIds: [assignee],
      event: "assigned_to_me",
      title: `New task: ${title}`,
      body: `Assigned by ${actor.full_name || actor.email}.`,
      link: clientId ? `/clients/${clientId}` : "/",
      exclude: actor.id,
    });
  }
  if (clientId) revalidatePath(`/clients/${clientId}`);
  revalidatePath("/");
}

export async function toggleTask(input: { id: string; status: "open" | "done"; clientId?: string | null }) {
  await requireActor();
  const supabase = await getServerSupabase();
  const { error } = await supabase.from("tasks").update({ status: input.status }).eq("id", input.id);
  if (error) throw new Error(error.message);
  if (input.clientId) revalidatePath(`/clients/${input.clientId}`);
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Client lines (AI phone lines)
// ---------------------------------------------------------------------------
const LINE_FIELDS = [
  "label",
  "ai_phone_number",
  "twilio_subaccount",
  "ghl_location_id",
  "dashboard_url",
  "booking_system",
  "regulatory_bundle_status",
  "prompt_status",
  "kb_status",
  "workflow_status",
  "notes",
] as const;

export async function upsertLine(formData: FormData) {
  await requireActor();
  const supabase = await getServerSupabase();
  const clientId = s(formData, "client_id");
  if (!clientId) throw new Error("Missing client id");
  const id = s(formData, "id");

  const row: Record<string, unknown> = { client_id: clientId };
  for (const f of LINE_FIELDS) if (formData.has(f)) row[f] = s(formData, f);

  if (id) {
    const { error } = await supabase.from("client_lines").update(row).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("client_lines").insert(row);
    if (error) throw new Error(error.message);
  }
  await logActivity({
    entity: "client",
    entityId: clientId,
    verb: "line",
    summary: id ? "Updated a phone line" : "Added a phone line",
  });
  revalidatePath(`/clients/${clientId}`);
}

export async function deleteLine(input: { id: string; clientId: string }) {
  await requireActor();
  const supabase = await getServerSupabase();
  const { error } = await supabase.from("client_lines").delete().eq("id", input.id);
  if (error) throw new Error(error.message);
  await logActivity({ entity: "client", entityId: input.clientId, verb: "line", summary: "Removed a phone line" });
  revalidatePath(`/clients/${input.clientId}`);
}

// ---------------------------------------------------------------------------
// VA placements
// ---------------------------------------------------------------------------
const PLACEMENT_FIELDS = [
  "va_name",
  "va_email",
  "va_cv_url",
  "tracker_url",
  "role",
  "employment_type",
  "placement_status",
] as const;

export async function upsertPlacement(formData: FormData) {
  await requireActor();
  const supabase = await getServerSupabase();
  const clientId = s(formData, "client_id");
  if (!clientId) throw new Error("Missing client id");
  const id = s(formData, "id");

  const row: Record<string, unknown> = { client_id: clientId };
  for (const f of PLACEMENT_FIELDS) if (formData.has(f)) row[f] = s(formData, f);

  if (id) {
    const { error } = await supabase.from("va_placements").update(row).eq("id", id);
    if (error) throw new Error(error.message);
  } else {
    const { error } = await supabase.from("va_placements").insert(row);
    if (error) throw new Error(error.message);
  }
  await logActivity({
    entity: "client",
    entityId: clientId,
    verb: "placement",
    summary: id ? "Updated VA placement" : "Added VA placement",
  });
  revalidatePath(`/clients/${clientId}`);
}
