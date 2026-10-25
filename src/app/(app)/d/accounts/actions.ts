"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireActorArea } from "@/lib/server/rbac";
import { addDaysIso, DEFAULT_DUE_DAYS, parsePeriod } from "@/lib/client-payments";
import { dublinDate, isIsoDate } from "@/lib/ops-core";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CURRENCIES = ["EUR", "GBP", "USD", "NZD", "AUD", "CAD"];

function s(fd: FormData, k: string, max = 2000): string | null {
  const v = fd.get(k);
  if (v == null) return null;
  const t = String(v).trim();
  return t === "" ? null : t.slice(0, max);
}
function num(fd: FormData, k: string): number | null {
  const t = s(fd, k);
  if (t == null) return null;
  const n = Number(t.replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
}
function idOf(fd: FormData, k = "id"): string {
  const id = s(fd, k);
  if (!id || !UUID.test(id)) throw new Error("Missing id");
  return id;
}
/** Back to the page the form was on (only our own Accounts pages), with a one-line message. */
function back(fd: FormData, msg: string): never {
  const to = s(fd, "back") ?? "/d/accounts";
  const path = /^\/d\/accounts(\/[a-z0-9-]+)*(\?[\w=&%.+-]*)?$/i.test(to) ? to : "/d/accounts";
  redirect(`${path}${path.includes("?") ? "&" : "?"}msg=${encodeURIComponent(msg)}`);
}
function date(fd: FormData, k: string): string | null | undefined {
  const v = s(fd, k);
  if (v == null) return null;
  return isIsoDate(v) ? v : undefined;
}

/** Add a payment line to a client, or edit one (all fields). */
export async function savePayment(fd: FormData) {
  const actor = await requireActorArea("payments");
  const id = s(fd, "id");
  const clientId = idOf(fd, "client_id");
  const period = s(fd, "period_label", 80);
  const amount = num(fd, "amount") ?? 0;
  const paid = num(fd, "paid_amount") ?? 0;
  const hours = num(fd, "hours");
  const currency = s(fd, "currency") ?? "EUR";
  const due = date(fd, "due_on");
  const invoicedOn = date(fd, "invoiced_on");
  const paidOn = date(fd, "paid_on");
  if (!period) back(fd, "Write the period, e.g. 1-15 November 2026");
  if (Number.isNaN(amount) || amount < 0 || Number.isNaN(paid) || paid < 0 || Number.isNaN(hours)) back(fd, "Amounts must be numbers");
  if (!CURRENCIES.includes(currency)) back(fd, "Unknown currency");
  if (due === undefined || invoicedOn === undefined || paidOn === undefined) back(fd, "Check the dates");

  const p = parsePeriod(period);
  const row = {
    client_id: clientId,
    va_name: s(fd, "va_name", 120),
    period_label: period,
    period_start: p?.start ?? null,
    period_end: p?.end ?? null,
    hours,
    amount,
    currency,
    invoice_no: s(fd, "invoice_no", 60),
    invoiced_on: invoicedOn,
    due_on: due ?? (p ? addDaysIso(p.end, DEFAULT_DUE_DAYS) : null),
    paid_amount: paid,
    paid_on: paid > 0 ? (paidOn ?? dublinDate()) : null,
    note: s(fd, "note", 2000),
    updated_by: actor.id,
  };
  const supabase = await getServerSupabase();
  const { error } = id
    ? await supabase.from("client_payments").update(row).eq("id", idOf(fd))
    : await supabase.from("client_payments").insert({ ...row, created_by: actor.id });
  if (error) back(fd, `Couldn't save: ${error.message}`);
  revalidatePath("/d/accounts", "layout");
  back(fd, id ? "Payment updated" : "Payment added");
}

/** For invoice → For collection: record the invoice number (and date sent). */
export async function markInvoiced(fd: FormData) {
  const actor = await requireActorArea("payments");
  const id = idOf(fd);
  const no = s(fd, "invoice_no", 60);
  const on = date(fd, "invoiced_on");
  if (!no) back(fd, "Write the invoice number");
  if (on === undefined) back(fd, "Check the date");
  const supabase = await getServerSupabase();
  const { error } = await supabase.from("client_payments").update({ invoice_no: no, invoiced_on: on ?? dublinDate(), updated_by: actor.id }).eq("id", id);
  if (error) back(fd, `Couldn't save: ${error.message}`);
  revalidatePath("/d/accounts", "layout");
  back(fd, `Invoice ${no} recorded`);
}

/** Record money received (full or part) and the date. */
export async function markPaid(fd: FormData) {
  const actor = await requireActorArea("payments");
  const id = idOf(fd);
  const amount = num(fd, "paid_amount");
  const on = date(fd, "paid_on");
  if (amount == null || Number.isNaN(amount) || amount <= 0) back(fd, "Write the amount received");
  if (on === undefined) back(fd, "Check the date");
  const supabase = await getServerSupabase();
  const { error } = await supabase.from("client_payments").update({ paid_amount: amount, paid_on: on ?? dublinDate(), updated_by: actor.id }).eq("id", id);
  if (error) back(fd, `Couldn't save: ${error.message}`);
  revalidatePath("/d/accounts", "layout");
  back(fd, "Payment recorded");
}

export async function deletePayment(fd: FormData) {
  await requireActorArea("payments");
  const id = idOf(fd);
  if (s(fd, "confirm") !== "DELETE") back(fd, "Type DELETE to remove this payment line");
  const supabase = await getServerSupabase();
  const { error } = await supabase.from("client_payments").delete().eq("id", id);
  if (error) back(fd, `Couldn't delete: ${error.message}`);
  revalidatePath("/d/accounts", "layout");
  back(fd, "Payment line removed");
}
