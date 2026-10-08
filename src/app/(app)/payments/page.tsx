import { getService } from "@/lib/server/service";
import { pipelinesFor } from "@/lib/service";
import Link from "next/link";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireArea, hasRole } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select, EmptyState } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { Flash, flashFrom } from "@/components/ops/flash";
import { CURRENCIES, addDays, daysBetween, dublinDate, formatMoney, invoiceHealth } from "@/lib/ops-core";
import { formatDate } from "@/lib/utils";
import { createInvoice, runRemindersNow } from "./actions";
import { ReminderCard } from "./reminder-card";
import { HEALTH } from "./health";
import type { Invoice, PaymentReminder } from "@/lib/types";
import { Tabs } from "@/components/motion/tabs";

export const metadata = { title: "Payments · OSF AI Team Dashboard" };

type Inv = Invoice & { clients: { name: string; contact_email: string | null } | null };

const VIEWS = { reminders: "Reminders to send", overdue: "Overdue", open: "Open", paid: "Paid", all: "All" } as const;
type View = keyof typeof VIEWS;

function sumBy(list: Inv[]): string {
  const m: Record<string, number> = {};
  for (const i of list) m[i.currency] = (m[i.currency] ?? 0) + Number(i.amount);
  const parts = Object.entries(m).map(([c, v]) => formatMoney(v, c));
  return parts.length ? parts.join(" + ") : "—";
}

export default async function PaymentsPage(props: PageProps<"/payments">) {
  const profile = await requireArea("payments");
  const canManage = hasRole(profile, "manager");
  const sp = await props.searchParams;
  const v = typeof sp.view === "string" ? sp.view : "";
  const msg = flashFrom(sp);
  const today = dublinDate();
  const supabase = await getServerSupabase();
  const pipes = pipelinesFor(await getService());

  const [{ data: invRows }, { data: drafts }, { data: clientRows }] = await Promise.all([
    supabase.from("invoices").select("*, clients!inner(name, contact_email, pipeline)").in("clients.pipeline", pipes).order("due_on", { ascending: true }).limit(2000),
    supabase.from("payment_reminders").select("*").eq("status", "draft").order("created_at"),
    supabase.from("clients").select("id, name, contact_email").in("pipeline", pipes).not("status", "in", "(withdrawn,rejected)").order("name"),
  ]);
  const invoices = (invRows as Inv[]) ?? [];
  const byId = new Map(invoices.map((i) => [i.id, i]));
  // only reminders for invoices on this side of the business
  const reminders = ((drafts as PaymentReminder[]) ?? []).filter((r) => byId.has(r.invoice_id));
  const health = (i: Inv) => invoiceHealth(i.status, i.due_on, today);

  const open = invoices.filter((i) => i.status === "open");
  const overdue = open.filter((i) => health(i) === "overdue");
  const dueSoon = open.filter((i) => health(i) === "due_soon");
  const monthStart = today.slice(0, 8) + "01";
  const paidMonth = invoices.filter((i) => i.status === "paid" && (i.paid_on ?? "") >= monthStart);

  const view: View = v in VIEWS ? (v as View) : reminders.length ? "reminders" : overdue.length ? "overdue" : "open";
  const shown =
    view === "overdue"
      ? overdue
      : view === "open"
        ? open
        : view === "paid"
          ? invoices.filter((i) => i.status === "paid").reverse()
          : invoices;

  const counts: Partial<Record<View, number>> = { reminders: reminders.length, overdue: overdue.length, open: open.length };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Payments"
        subtitle="Client invoices and payment reminders. Reminders are drafted automatically; a manager sends them."
        actions={
          canManage ? (
            <form action={runRemindersNow}>
              <SubmitButton size="sm" variant="secondary" pendingText="Checking…">
                Check for reminders now
              </SubmitButton>
            </form>
          ) : null
        }
      />
      <Flash msg={msg} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { l: "Outstanding", v: sumBy(open), s: `${open.length} open invoice${open.length === 1 ? "" : "s"}` },
          { l: "Overdue", v: sumBy(overdue), s: `${overdue.length} invoice${overdue.length === 1 ? "" : "s"}`, hot: overdue.length > 0 },
          { l: "Due in 7 days", v: sumBy(dueSoon), s: `${dueSoon.length} invoice${dueSoon.length === 1 ? "" : "s"}` },
          { l: "Paid this month", v: sumBy(paidMonth), s: `${paidMonth.length} invoice${paidMonth.length === 1 ? "" : "s"}` },
        ].map((t) => (
          <div key={t.l} className="glass rounded-2xl px-4 py-3">
            <p className="text-xs text-ink-faint">{t.l}</p>
            <p className={`mt-1 text-lg font-semibold ${t.hot ? "text-rose-600" : "text-ink"}`}>{t.v}</p>
            <p className="text-xs text-ink-faint">{t.s}</p>
          </div>
        ))}
      </div>

      {canManage && (
        <details className="glass rounded-2xl">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-ink">+ Add an invoice</summary>
          <form action={createInvoice} className="grid grid-cols-1 gap-3 px-4 pb-4 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <Label>Client *</Label>
              <Select name="client_id" required defaultValue="">
                <option value="" disabled>
                  Choose a client
                </option>
                {(clientRows ?? []).map((c) => (
                  <option key={c.id as string} value={c.id as string}>
                    {c.name as string}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Invoice number *</Label>
              <Input name="number" required maxLength={60} placeholder="INV-1042" />
            </div>
            <div className="sm:col-span-3">
              <Label>Description</Label>
              <Input name="description" maxLength={500} placeholder="e.g. AI receptionist, October" />
            </div>
            <div>
              <Label>Amount *</Label>
              <Input name="amount" type="number" step="0.01" min="0.01" required />
            </div>
            <div>
              <Label>Currency</Label>
              <Select name="currency" defaultValue="GBP">
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Billing email</Label>
              <Input name="bill_to_email" type="email" maxLength={200} placeholder="defaults to client email" />
            </div>
            <div>
              <Label>Issued</Label>
              <Input name="issued_on" type="date" defaultValue={today} required />
            </div>
            <div>
              <Label>Due *</Label>
              <Input name="due_on" type="date" defaultValue={addDays(today, 14)} required />
            </div>
            <div className="flex items-end">
              <SubmitButton size="sm" pendingText="Adding…">
                Add invoice
              </SubmitButton>
            </div>
          </form>
        </details>
      )}

      <Tabs
        active={view}
        items={(Object.keys(VIEWS) as View[]).map((k) => ({
          key: k,
          href: `/payments?view=${k}`,
          label: (
            <>
              {VIEWS[k]}
              {counts[k] ? (
                <span className={`ml-1.5 rounded-full px-1.5 text-xs ${k === "overdue" ? "bg-rose-50 text-rose-600" : "bg-fill"}`}>
                  {counts[k]}
                </span>
              ) : null}
            </>
          ),
        }))}
      />

      {view === "reminders" ? (
        reminders.length === 0 ? (
          <EmptyState>No reminders waiting. They are drafted each morning: 3 days before due, on the due date, then 3, 7 and 14 days overdue.</EmptyState>
        ) : (
          <div className="space-y-3">
            {reminders.map((r) => {
              const inv = byId.get(r.invoice_id);
              return (
                <ReminderCard
                  key={r.id}
                  r={r}
                  back="list"
                  canSend={canManage}
                  to={inv?.bill_to_email ?? inv?.clients?.contact_email ?? null}
                  title={
                    <Link href={`/payments/${r.invoice_id}`} className="font-semibold text-ink hover:underline">
                      {inv?.clients?.name ?? "Client"} · {inv?.number} · {inv ? formatMoney(Number(inv.amount), inv.currency) : ""}
                    </Link>
                  }
                />
              );
            })}
          </div>
        )
      ) : shown.length === 0 ? (
        <EmptyState>No invoices here.</EmptyState>
      ) : (
        <div className="glass overflow-x-auto rounded-2xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-faint">
                <th className="px-4 py-2.5 font-medium">Client</th>
                <th className="px-4 py-2.5 font-medium">Invoice</th>
                <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                <th className="px-4 py-2.5 font-medium">Due</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => {
                const h = health(i);
                const late = daysBetween(i.due_on, today);
                return (
                  <tr key={i.id} className="border-b border-line last:border-0 hover:bg-fill">
                    <td className="px-4 py-2.5">
                      <Link href={`/clients/${i.client_id}`} className="text-ink hover:underline">
                        {i.clients?.name ?? "—"}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">
                      <Link href={`/payments/${i.id}`} className="font-medium text-ink hover:underline">
                        {i.number}
                      </Link>
                      {i.description && <p className="text-xs text-ink-faint">{i.description}</p>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right font-medium text-ink">
                      {formatMoney(Number(i.amount), i.currency)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-ink-muted">
                      {formatDate(i.due_on)}
                      {i.status === "open" && (
                        <p className={`text-xs ${late > 0 ? "text-rose-600" : "text-ink-faint"}`}>
                          {late > 0 ? `${late} day${late === 1 ? "" : "s"} late` : late === 0 ? "due today" : `in ${-late} day${late === -1 ? "" : "s"}`}
                        </p>
                      )}
                      {i.status === "paid" && i.paid_on && <p className="text-xs text-ink-faint">paid {formatDate(i.paid_on)}</p>}
                    </td>
                    <td className="px-4 py-2.5">
                      <Badge tone={HEALTH[h].tone}>{HEALTH[h].label}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
