"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireActorRole } from "@/lib/server/rbac";
import { logActivity } from "@/lib/server/activity";
import { createManualReminder, generateReminderDrafts, sendReminder } from "@/lib/server/payments";
import { CURRENCIES, dublinDate, formatMoney, isIsoDate } from "@/lib/ops-core";

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

function go(path: string, msg: string): never {
  redirect(`${path}${path.includes("?") ? "&" : "?"}msg=${encodeURIComponent(msg)}`);
}

export async function createInvoice(formData: FormData) {
  const actor = await requireActorRole("manager");
  const clientId = idOf(formData, "client_id");
  const number = s(formData, "number", 60);
  const amount = Number(s(formData, "amount"));
  const currency = s(formData, "currency") ?? "GBP";
  const issued = s(formData, "issued_on") ?? dublinDate();
  const due = s(formData, "due_on");
  const billTo = s(formData, "bill_to_email", 200);
  if (!number) go("/payments?view=open", "Invoice number is required");
  if (!Number.isFinite(amount) || amount <= 0) go("/payments?view=open", "Amount must be more than 0");
  if (!(CURRENCIES as readonly string[]).includes(currency)) go("/payments?view=open", "Unknown currency");
  if (!isIsoDate(issued) || !due || !isIsoDate(due) || due < issued) go("/payments?view=open", "Check the dates (due on or after issued)");
  if (billTo && !EMAIL.test(billTo)) go("/payments?view=open", "Billing email doesn't look right");

  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("invoices")
    .insert({
      client_id: clientId,
      number,
      description: s(formData, "description", 500),
      amount: Math.round(amount * 100) / 100,
      currency,
      issued_on: issued,
      due_on: due,
      bill_to_email: billTo,
      created_by: actor.id,
    })
    .select("id")
    .single();
  if (error) go("/payments?view=open", error.code === "23505" ? `Invoice ${number} already exists` : error.message);
  await logActivity({
    entity: "client",
    entityId: clientId,
    verb: "updated",
    summary: `Invoice ${number} added: ${formatMoney(amount, currency)} due ${due}`,
  });
  revalidatePath("/payments");
  go(`/payments/${data!.id}`, "Invoice added. Reminders will be drafted automatically from 3 days before the due date.");
}

export async function setInvoiceStatus(formData: FormData) {
  await requireActorRole("manager");
  const id = idOf(formData);
  const status = s(formData, "status");
  if (status !== "paid" && status !== "void" && status !== "open") throw new Error("Invalid status");
  const paidOn = s(formData, "paid_on") ?? dublinDate();
  const supabase = await getServerSupabase();
  const { data: inv, error } = await supabase
    .from("invoices")
    .update({ status, paid_on: status === "paid" ? (isIsoDate(paidOn) ? paidOn : dublinDate()) : null })
    .eq("id", id)
    .select("client_id, number")
    .single();
  if (error) throw new Error(error.message);
  if (status !== "open") {
    // nothing left to chase
    await supabase.from("payment_reminders").update({ status: "skipped" }).eq("invoice_id", id).eq("status", "draft");
  }
  await logActivity({
    entity: "client",
    entityId: inv.client_id as string,
    verb: "updated",
    summary: `Invoice ${inv.number} marked ${status}`,
  });
  revalidatePath("/payments");
  revalidatePath(`/payments/${id}`);
  go(`/payments/${id}`, status === "paid" ? "Marked paid" : status === "void" ? "Invoice voided" : "Re-opened");
}

export async function updateInvoice(formData: FormData) {
  await requireActorRole("manager");
  const id = idOf(formData);
  const due = s(formData, "due_on");
  const billTo = s(formData, "bill_to_email", 200);
  if (!due || !isIsoDate(due)) go(`/payments/${id}`, "Due date is required");
  if (billTo && !EMAIL.test(billTo)) go(`/payments/${id}`, "Billing email doesn't look right");
  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("invoices")
    .update({ due_on: due, bill_to_email: billTo, description: s(formData, "description", 500), notes: s(formData, "notes", 2000) })
    .eq("id", id);
  if (error) go(`/payments/${id}`, error.message);
  revalidatePath("/payments");
  go(`/payments/${id}`, "Saved");
}

export async function sendReminderAction(formData: FormData) {
  const actor = await requireActorRole("manager");
  const id = idOf(formData);
  const back = s(formData, "back") === "list" ? "/payments?view=reminders" : `/payments/${idOf(formData, "invoice_id")}`;
  const subject = s(formData, "subject", 200);
  const body = s(formData, "body");
  if (!subject || !body) go(back, "Subject and message are required");
  const r = await sendReminder(id, actor.id, { subject: subject!, body: body! });
  revalidatePath("/payments");
  go(back, r.ok ? "Reminder sent" : r.error ?? "Could not send");
}

export async function skipReminder(formData: FormData) {
  await requireActorRole("manager");
  const id = idOf(formData);
  const supabase = await getServerSupabase();
  await supabase.from("payment_reminders").update({ status: "skipped" }).eq("id", id).eq("status", "draft");
  revalidatePath("/payments");
  go(s(formData, "back") === "list" ? "/payments?view=reminders" : `/payments/${idOf(formData, "invoice_id")}`, "Skipped");
}

export async function draftReminderNow(formData: FormData) {
  await requireActorRole("manager");
  const id = idOf(formData);
  const r = await createManualReminder(id);
  revalidatePath(`/payments/${id}`);
  go(`/payments/${id}`, r ? "Reminder drafted below. Review and send." : "Could not draft a reminder");
}

export async function runRemindersNow() {
  await requireActorRole("manager");
  const r = await generateReminderDrafts(dublinDate());
  revalidatePath("/payments");
  go("/payments?view=reminders", `${r.created} reminder${r.created === 1 ? "" : "s"} drafted`);
}
