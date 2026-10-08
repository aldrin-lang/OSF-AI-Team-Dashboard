import "server-only";
import { getAdminSupabase } from "@/lib/supabase/server";
import { allRows } from "@/lib/server/paged";
import { clientEmailShell, sendEmail } from "@/lib/server/email";
import { claimSend, releaseSend } from "@/lib/server/send-claim";
import { areaUserIds, notifyUsers } from "@/lib/server/notify";
import { addDays, formatMoney, reminderStage, reminderTemplate, textToHtml, type ReminderStage } from "@/lib/ops-core";
import type { Invoice, PaymentReminder } from "@/lib/types";

type InvoiceWithClient = Invoice & { clients: { name: string; contact_email: string | null } | null };

/** Contact first name for the greeting: the lead the client came from, if any. */
async function contactNames(clientIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (!clientIds.length) return out;
  const { data } = await getAdminSupabase().from("leads").select("client_id, name").in("client_id", clientIds);
  for (const l of data ?? []) if (l.name) out.set(l.client_id as string, String(l.name).split(/\s+/)[0]);
  return out;
}

export function draftFor(inv: InvoiceWithClient, stage: ReminderStage | "manual", contactName: string | null) {
  return reminderTemplate({
    stage,
    clientName: inv.clients?.name ?? "there",
    contactName,
    invoiceNumber: inv.number,
    amount: formatMoney(Number(inv.amount), inv.currency),
    dueOn: inv.due_on,
  });
}

/**
 * Daily: draft the reminder each open invoice needs today (3 days before,
 * due day, then 3/7/14 days overdue). Drafts are never sent automatically;
 * a manager reviews and sends them from the Payments page.
 */
export async function generateReminderDrafts(today: string): Promise<{ created: number; titles: string[] }> {
  const db = getAdminSupabase();
  const invRows = await allRows((a, b) =>
    db
      .from("invoices")
      .select("*, clients(name, contact_email)")
      .eq("status", "open")
      .lte("due_on", addDays(today, 3)) // nothing further out needs a reminder yet
      .order("id")
      .range(a, b),
  );
  const invoices = (invRows as InvoiceWithClient[]).filter((i) => reminderStage(i.due_on, today));
  if (!invoices.length) return { created: 0, titles: [] };

  const have = new Set<string>();
  for (let i = 0; i < invoices.length; i += 150) {
    const ids = invoices.slice(i, i + 150).map((x) => x.id);
    const existing = await allRows((a, b) => db.from("payment_reminders").select("invoice_id, stage").in("invoice_id", ids).order("id").range(a, b));
    for (const r of existing) have.add(`${r.invoice_id}:${r.stage}`);
  }
  const names = await contactNames([...new Set(invoices.map((i) => i.client_id))]);

  const titles: string[] = [];
  for (const inv of invoices) {
    const stage = reminderStage(inv.due_on, today)!;
    if (have.has(`${inv.id}:${stage}`)) continue;
    const d = draftFor(inv, stage, names.get(inv.client_id) ?? null);
    const { error } = await db
      .from("payment_reminders")
      .insert({ invoice_id: inv.id, stage, subject: d.subject, body: d.body });
    if (!error) titles.push(`${inv.clients?.name ?? "Client"} · ${inv.number}`);
    else if (error.code !== "23505") console.error("[payments] draft insert failed", error.message);
  }

  if (titles.length) {
    await notifyUsers({
      userIds: await areaUserIds("payments"),
      event: "payment_reminders",
      title: `${titles.length} payment reminder${titles.length === 1 ? "" : "s"} ready to send`,
      body: titles.slice(0, 15).join("\n"),
      link: "/payments?view=reminders",
    });
  }
  return { created: titles.length, titles };
}

/** Manual "send a reminder now" draft for one invoice. */
export async function createManualReminder(invoiceId: string): Promise<string | null> {
  const db = getAdminSupabase();
  const { data } = await db.from("invoices").select("*, clients(name, contact_email)").eq("id", invoiceId).maybeSingle();
  const inv = data as InvoiceWithClient | null;
  if (!inv) return null;
  const names = await contactNames([inv.client_id]);
  const d = draftFor(inv, "manual", names.get(inv.client_id) ?? null);
  const { data: row } = await db
    .from("payment_reminders")
    .insert({ invoice_id: inv.id, stage: "manual", subject: d.subject, body: d.body })
    .select("id")
    .single();
  return (row?.id as string) ?? null;
}

export async function sendReminder(
  id: string,
  actorId: string,
  edits: { subject: string; body: string },
): Promise<{ ok: boolean; error?: string }> {
  const db = getAdminSupabase();
  const { data } = await db
    .from("payment_reminders")
    .select("*, invoices(*, clients(name, contact_email))")
    .eq("id", id)
    .maybeSingle();
  const r = data as (PaymentReminder & { invoices: InvoiceWithClient | null }) | null;
  if (!r || !r.invoices) return { ok: false, error: "Reminder not found" };
  if (r.status === "sent") return { ok: false, error: "Already sent" };
  if (r.invoices.status !== "open") return { ok: false, error: "This invoice is no longer open" };

  const to = r.invoices.bill_to_email ?? r.invoices.clients?.contact_email;
  if (!to) return { ok: false, error: "No billing email. Add one on the invoice or the client." };

  if (!(await claimSend(db, "payment_reminders", id, "draft"))) {
    return { ok: false, error: "This reminder was already sent, or someone is sending it right now." };
  }
  const res = await sendEmail({ to, subject: edits.subject, html: clientEmailShell(textToHtml(edits.body)), text: edits.body });
  if (res.skipped || !res.ok) {
    await releaseSend(db, "payment_reminders", id);
    if (res.skipped) return { ok: false, error: "Email sending isn't set up on the server (RESEND_API_KEY / EMAIL_FROM)." };
    return { ok: false, error: "The email provider rejected the message. Try again." };
  }

  await db
    .from("payment_reminders")
    .update({ subject: edits.subject, body: edits.body, status: "sent", sent_at: new Date().toISOString(), sent_by: actorId, send_claimed_at: null })
    .eq("id", id);
  return { ok: true };
}
