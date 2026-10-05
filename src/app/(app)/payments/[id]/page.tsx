import { notFound } from "next/navigation";
import Link from "next/link";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireArea, hasRole } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardBody, Input, Label, Textarea } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { Flash, flashFrom } from "@/components/ops/flash";
import { REMINDER_STAGE_LABEL, addDays, dublinDate, formatMoney, invoiceHealth, type ReminderStage } from "@/lib/ops-core";
import { formatDate } from "@/lib/utils";
import { draftReminderNow, setInvoiceStatus, updateInvoice } from "../actions";
import { ReminderCard } from "../reminder-card";
import { HEALTH } from "../health";
import type { Invoice, PaymentReminder } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PLAN: { stage: ReminderStage; offset: number }[] = [
  { stage: "before_due", offset: -3 },
  { stage: "due_today", offset: 0 },
  { stage: "overdue_3", offset: 3 },
  { stage: "overdue_7", offset: 7 },
  { stage: "overdue_14", offset: 14 },
];

export default async function InvoicePage(props: PageProps<"/payments/[id]">) {
  const { id } = await props.params;
  if (!UUID.test(id)) notFound();
  const profile = await requireArea("payments");
  const canManage = hasRole(profile, "manager");
  const msg = flashFrom(await props.searchParams);
  const supabase = await getServerSupabase();

  const [{ data }, { data: remRows }] = await Promise.all([
    supabase.from("invoices").select("*, clients(name, contact_email)").eq("id", id).maybeSingle(),
    supabase.from("payment_reminders").select("*").eq("invoice_id", id).order("created_at", { ascending: false }),
  ]);
  if (!data) notFound();
  const inv = data as Invoice & { clients: { name: string; contact_email: string | null } | null };
  const reminders = (remRows as PaymentReminder[]) ?? [];
  const today = dublinDate();
  const h = HEALTH[invoiceHealth(inv.status, inv.due_on, today)];
  const to = inv.bill_to_email ?? inv.clients?.contact_email ?? null;
  const byStage = new Map(reminders.map((r) => [r.stage, r]));

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={`${inv.number} · ${formatMoney(Number(inv.amount), inv.currency)}`}
        subtitle={`${inv.clients?.name ?? "Client"} · issued ${formatDate(inv.issued_on)} · due ${formatDate(inv.due_on)}`}
        actions={
          <Link href="/payments" className="text-sm text-ink-muted hover:text-ink">
            All payments
          </Link>
        }
      />
      <Flash msg={msg} />

      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={h.tone}>{h.label}</Badge>
        {inv.paid_on && <span className="text-sm text-ink-muted">Paid {formatDate(inv.paid_on)}</span>}
        <Link href={`/clients/${inv.client_id}`} className="text-sm text-brand-600 hover:underline">
          {inv.clients?.name} →
        </Link>
        {canManage && (
          <div className="ml-auto flex flex-wrap gap-2">
            {inv.status === "open" ? (
              <>
                <form action={setInvoiceStatus} className="flex items-center gap-2">
                  <input type="hidden" name="id" value={inv.id} />
                  <input type="hidden" name="status" value="paid" />
                  <Input name="paid_on" type="date" defaultValue={today} className="w-40" />
                  <SubmitButton size="sm" pendingText="Saving…">
                    Mark paid
                  </SubmitButton>
                </form>
                <form action={setInvoiceStatus}>
                  <input type="hidden" name="id" value={inv.id} />
                  <input type="hidden" name="status" value="void" />
                  <SubmitButton size="sm" variant="ghost" pendingText="Saving…">
                    Void
                  </SubmitButton>
                </form>
              </>
            ) : (
              <form action={setInvoiceStatus}>
                <input type="hidden" name="id" value={inv.id} />
                <input type="hidden" name="status" value="open" />
                <SubmitButton size="sm" variant="secondary" pendingText="Saving…">
                  Re-open
                </SubmitButton>
              </form>
            )}
          </div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Reminder plan</CardTitle>
        </CardHeader>
        <CardBody>
          <ol className="space-y-2 text-sm">
            {PLAN.map((p) => {
              const date = addDays(inv.due_on, p.offset);
              const r = byStage.get(p.stage);
              const state = r
                ? r.status === "sent"
                  ? { t: "Sent", tone: "green" as const }
                  : r.status === "skipped"
                    ? { t: "Skipped", tone: "neutral" as const }
                    : { t: "Draft ready", tone: "blue" as const }
                : inv.status !== "open"
                  ? { t: "Not needed", tone: "neutral" as const }
                  : date > today
                    ? { t: "Planned", tone: "neutral" as const }
                    : { t: "Due", tone: "amber" as const };
              return (
                <li key={p.stage} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 text-ink-faint">{formatDate(date)}</span>
                  <span className="flex-1 text-ink">{REMINDER_STAGE_LABEL[p.stage]}</span>
                  <Badge tone={state.tone}>{state.t}</Badge>
                </li>
              );
            })}
          </ol>
          <p className="mt-3 text-xs text-ink-faint">
            Sent to {to ?? "no billing email yet (add one below)"}. Nothing is emailed until a manager presses Send.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Reminders</CardTitle>
          {canManage && inv.status === "open" && (
            <form action={draftReminderNow}>
              <input type="hidden" name="id" value={inv.id} />
              <SubmitButton size="sm" variant="secondary" pendingText="Drafting…">
                Draft a reminder now
              </SubmitButton>
            </form>
          )}
        </CardHeader>
        <CardBody className="space-y-3">
          {reminders.length === 0 ? (
            <p className="text-sm text-ink-faint">No reminders yet.</p>
          ) : (
            reminders.map((r) => <ReminderCard key={r.id} r={r} to={to} back="invoice" canSend={canManage && inv.status === "open"} />)
          )}
        </CardBody>
      </Card>

      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>Edit</CardTitle>
          </CardHeader>
          <CardBody>
            <form action={updateInvoice} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input type="hidden" name="id" value={inv.id} />
              <div>
                <Label>Due date</Label>
                <Input name="due_on" type="date" defaultValue={inv.due_on} required />
              </div>
              <div>
                <Label>Billing email</Label>
                <Input name="bill_to_email" type="email" defaultValue={inv.bill_to_email ?? ""} placeholder={inv.clients?.contact_email ?? ""} />
              </div>
              <div className="sm:col-span-2">
                <Label>Description</Label>
                <Input name="description" defaultValue={inv.description ?? ""} maxLength={500} />
              </div>
              <div className="sm:col-span-2">
                <Label>Internal notes</Label>
                <Textarea name="notes" defaultValue={inv.notes ?? ""} placeholder="e.g. client promised to pay Friday" />
              </div>
              <div>
                <SubmitButton size="sm" pendingText="Saving…">
                  Save
                </SubmitButton>
              </div>
            </form>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
