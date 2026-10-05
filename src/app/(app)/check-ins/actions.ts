"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireActor, requireActorRole } from "@/lib/server/rbac";
import { createCheckinNow, generateDueCheckins, logReply, sendCheckinEmail } from "@/lib/server/checkins";
import { dublinDate } from "@/lib/ops-core";

function s(fd: FormData, k: string, max = 8000): string | null {
  const v = fd.get(k);
  if (v == null) return null;
  const t = String(v).trim();
  return t === "" ? null : t.slice(0, max);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function idOf(fd: FormData, k = "id"): string {
  const id = s(fd, k);
  if (!id || !UUID.test(id)) throw new Error("Missing id");
  return id;
}

function back(view: string | null, msg: string): never {
  const v = ["send", "waiting", "attention", "done", "schedule"].includes(view ?? "") ? view : "send";
  redirect(`/check-ins?view=${v}&msg=${encodeURIComponent(msg)}`);
}

export async function sendCheckin(formData: FormData) {
  const actor = await requireActor();
  const id = idOf(formData);
  const subject = s(formData, "subject", 200);
  const message = s(formData, "message");
  const to = s(formData, "to", 200);
  if (!subject || !message) back("send", "Subject and message are required");
  if (to && !EMAIL.test(to)) back("send", "That email address doesn't look right");
  const r = await sendCheckinEmail(id, actor.id, { subject: subject!, message: message!, to });
  revalidatePath("/check-ins");
  back("send", r.ok ? "Check-in email sent" : r.error ?? "Could not send");
}

/** Sent outside the dashboard (WhatsApp link or a phone call): just record it. */
export async function markSent(formData: FormData) {
  const actor = await requireActor();
  const id = idOf(formData);
  const channel = s(formData, "channel") === "call" ? "call" : "whatsapp";
  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("checkins")
    .update({
      subject: s(formData, "subject", 200),
      message: s(formData, "message"),
      channel,
      status: "sent",
      sent_at: new Date().toISOString(),
      sent_by: actor.id,
    })
    .eq("id", id)
    .eq("status", "due");
  if (error) throw new Error(error.message);
  revalidatePath("/check-ins");
  back("send", channel === "call" ? "Marked as called" : "Marked as sent on WhatsApp");
}

export async function saveReply(formData: FormData) {
  const actor = await requireActor();
  const id = idOf(formData);
  const reply = s(formData, "reply");
  if (!reply) back(s(formData, "view"), "Paste the reply first");
  const m = s(formData, "mood");
  const mood = m === "good" || m === "neutral" || m === "at_risk" ? m : null;
  const r = await logReply(id, reply!, actor.id, mood);
  revalidatePath("/check-ins");
  back("attention", r.error ?? (r.atRisk ? "Saved. Flagged at risk and managers notified" : "Reply saved"));
}

export async function closeCheckin(formData: FormData) {
  await requireActor();
  const id = idOf(formData);
  const status = s(formData, "status") === "skipped" ? "skipped" : "done";
  const supabase = await getServerSupabase();
  const { error } = await supabase.from("checkins").update({ status }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/check-ins");
  back(s(formData, "view"), status === "skipped" ? "Skipped" : "Marked done");
}

export async function updateCadence(formData: FormData) {
  await requireActor();
  const id = idOf(formData);
  const table = s(formData, "kind") === "va" ? "va_placements" : "clients";
  const every = Math.round(Number(s(formData, "every") ?? "14"));
  if (!Number.isFinite(every) || every < 3 || every > 90) back("schedule", "Cadence must be 3 to 90 days");
  const patch: Record<string, unknown> = { checkin_every_days: every, checkin_paused: s(formData, "paused") === "on" };
  if (table === "va_placements" && formData.has("va_phone")) patch.va_phone = s(formData, "va_phone", 40);
  const supabase = await getServerSupabase();
  const { error } = await supabase.from(table).update(patch).eq("id", id);
  if (error) back("schedule", error.message);
  revalidatePath("/check-ins");
  back("schedule", "Saved");
}

export async function checkInNow(formData: FormData) {
  await requireActor();
  const clientId = idOf(formData, "client_id");
  const placementId = s(formData, "placement_id");
  if (placementId && !UUID.test(placementId)) throw new Error("Bad placement id");
  const r = await createCheckinNow(placementId ? "va" : "client", clientId, placementId, dublinDate());
  revalidatePath("/check-ins");
  back(r.ok ? "send" : "schedule", r.ok ? "Check-in drafted. Review and send it below" : r.error ?? "Could not create");
}

export async function runDueNow() {
  await requireActorRole("manager");
  const r = await generateDueCheckins(dublinDate());
  revalidatePath("/check-ins");
  back("send", `${r.created} check-in${r.created === 1 ? "" : "s"} due today${r.ai ? ` (${r.ai} written by AI)` : ""}`);
}
