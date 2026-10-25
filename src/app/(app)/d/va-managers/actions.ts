"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireActorArea } from "@/lib/server/rbac";
import { dublinDate, isIsoDate } from "@/lib/ops-core";
import { parseAmount } from "@/lib/client-payments";
import { CHANGE_STATUSES } from "@/lib/ops-records";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STALE = "Someone else changed this just now. Reload the page and try again.";

function s(fd: FormData, k: string, max = 2000): string | null {
  const v = fd.get(k);
  if (v == null) return null;
  const t = String(v).trim();
  return t === "" ? null : t.slice(0, max);
}
function idOf(fd: FormData, k = "id"): string {
  const id = s(fd, k);
  if (!id || !UUID.test(id)) throw new Error("Missing id");
  return id;
}
function back(fd: FormData, msg: string): never {
  const to = s(fd, "back") ?? "/d/va-managers/checkins";
  const path = /^\/d\/va-managers\/[a-z-]+(\?[\w=&%.+-]*)?$/i.test(to) ? to : "/d/va-managers/checkins";
  redirect(`${path}${path.includes("?") ? "&" : "?"}msg=${encodeURIComponent(msg)}`);
}
/** Blank → null; a real date → it; anything else → undefined (rejected). */
function dateOf(fd: FormData, k: string): string | null | undefined {
  const v = s(fd, k);
  return v == null ? null : isIsoDate(v) ? v : undefined;
}
function done(fd: FormData, msg: string): never {
  revalidatePath("/d/va-managers", "layout");
  back(fd, msg);
}

// ---------------------------------------------------------------- monthly check-ins

/** Log this month's check-in for a client (a call, with how it went and a note). */
export async function logCheckin(fd: FormData) {
  const actor = await requireActorArea("clients");
  const clientId = idOf(fd, "client_id");
  const due = dateOf(fd, "due_on");
  const on = dateOf(fd, "done_on");
  const mood = s(fd, "mood");
  if (!due || on === undefined) back(fd, "Check the date");
  if (mood && !["good", "neutral", "at_risk"].includes(mood)) back(fd, "Pick how it went");
  const supabase = await getServerSupabase();
  const row = {
    kind: "client" as const,
    client_id: clientId,
    due_on: due,
    channel: "call",
    status: "done" as const,
    mood: mood ?? null,
    reply: s(fd, "note", 4000),
    sent_at: new Date(`${on ?? dublinDate()}T12:00:00Z`).toISOString(),
    sent_by: actor.id,
  };
  // one check-in per client per month: logging again updates it
  const { data: existing } = await supabase.from("checkins").select("id").eq("kind", "client").eq("client_id", clientId).is("placement_id", null).eq("due_on", due).maybeSingle();
  const { error } = existing
    ? await supabase.from("checkins").update(row).eq("id", existing.id)
    : await supabase.from("checkins").insert(row);
  if (error) back(fd, `Couldn't save: ${error.message}`);
  done(fd, "Check-in logged");
}

/** Set (or clear) the day of the month a client is checked in with. */
export async function setCheckinDay(fd: FormData) {
  await requireActorArea("clients");
  const id = idOf(fd, "client_id");
  const raw = s(fd, "checkin_day");
  const day = raw == null ? null : Number(raw);
  if (day !== null && (!Number.isInteger(day) || day < 1 || day > 31)) back(fd, "The check-in day is a number from 1 to 31");
  const supabase = await getServerSupabase();
  const { error } = await supabase.from("clients").update({ checkin_day: day, csm_name: s(fd, "csm_name", 80) }).eq("id", id);
  if (error) back(fd, `Couldn't save: ${error.message}`);
  done(fd, "Check-in day saved");
}

// ---------------------------------------------------------------- red flags

export async function saveRedFlag(fd: FormData) {
  const actor = await requireActorArea("clients");
  const id = s(fd, "id");
  const added = dateOf(fd, "added_on");
  if (added === undefined) back(fd, "Check the date");
  const focus = s(fd, "focus") === "va" ? "va" : "client";
  const status = s(fd, "status") === "resolved" ? "resolved" : "open";
  const row = {
    client_id: idOf(fd, "client_id"),
    va_name: s(fd, "va_name", 120),
    focus,
    manager_name: s(fd, "manager_name", 80),
    reason: s(fd, "reason"),
    rca: s(fd, "rca"),
    action_taken: s(fd, "action_taken"),
    status,
    added_on: added ?? dublinDate(),
    resolved_on: status === "resolved" ? (dateOf(fd, "resolved_on") || dublinDate()) : null,
    notes: s(fd, "notes"),
    updated_by: actor.id,
  };
  if (!row.reason) back(fd, "Write the reason");
  const supabase = await getServerSupabase();
  if (id) {
    const { data, error } = await supabase.from("red_flags").update(row).eq("id", idOf(fd)).eq("updated_at", s(fd, "updated_at") ?? "").select("id");
    if (error) back(fd, `Couldn't save: ${error.message}`);
    if (!data?.length) back(fd, STALE);
  } else {
    const { error } = await supabase.from("red_flags").insert({ ...row, created_by: actor.id });
    if (error) back(fd, `Couldn't save: ${error.message}`);
  }
  done(fd, id ? "Red flag updated" : "Red flag added");
}

/** Open ↔ resolved in one click. */
export async function toggleRedFlag(fd: FormData) {
  const actor = await requireActorArea("clients");
  const resolve = s(fd, "to") === "resolved";
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("red_flags")
    .update({ status: resolve ? "resolved" : "open", resolved_on: resolve ? dublinDate() : null, updated_by: actor.id })
    .eq("id", idOf(fd))
    .eq("updated_at", s(fd, "updated_at") ?? "")
    .select("id");
  if (error) back(fd, `Couldn't save: ${error.message}`);
  if (!data?.length) back(fd, STALE);
  done(fd, resolve ? "Red flag resolved" : "Red flag reopened");
}

// ---------------------------------------------------------------- replacements & cancellations

export async function saveChange(fd: FormData) {
  const actor = await requireActorArea("clients");
  const id = s(fd, "id");
  const status = s(fd, "status") ?? "in_progress";
  if (!(CHANGE_STATUSES as readonly string[]).includes(status)) back(fd, "Unknown status");
  const dates = { last_day: dateOf(fd, "last_day"), notified_on: dateOf(fd, "notified_on") };
  if (Object.values(dates).some((d) => d === undefined)) back(fd, "Check the dates");
  const profitRaw = s(fd, "monthly_profit");
  const profit = profitRaw == null ? null : parseAmount(profitRaw);
  if (Number.isNaN(profit)) back(fd, "Monthly profit must be a number like 450.00");
  const ctl = s(fd, "controllable");
  const row = {
    kind: s(fd, "kind") === "cancellation" ? "cancellation" : "replacement",
    client_id: idOf(fd, "client_id"),
    va_name: s(fd, "va_name", 120),
    va_role: s(fd, "va_role", 200),
    manager_name: s(fd, "manager_name", 80),
    reason_tag: s(fd, "reason_tag", 80),
    reason: s(fd, "reason"),
    rca: s(fd, "rca"),
    controllable: ctl === "yes" ? true : ctl === "no" ? false : null,
    action_next: s(fd, "action_next"),
    ...dates,
    initiated_by: s(fd, "initiated_by", 80),
    assigned_to: s(fd, "assigned_to", 80),
    status,
    status_detail: s(fd, "status_detail", 80),
    monthly_profit: profit,
    notes: s(fd, "notes"),
    updated_by: actor.id,
  };
  const supabase = await getServerSupabase();
  if (id) {
    const { data, error } = await supabase.from("va_changes").update(row).eq("id", idOf(fd)).eq("updated_at", s(fd, "updated_at") ?? "").select("id");
    if (error) back(fd, `Couldn't save: ${error.message}`);
    if (!data?.length) back(fd, STALE);
  } else {
    const { error } = await supabase.from("va_changes").insert({ ...row, created_by: actor.id });
    if (error) back(fd, `Couldn't save: ${error.message}`);
  }
  done(fd, id ? "Saved" : row.kind === "cancellation" ? "Cancellation added" : "Replacement added");
}
