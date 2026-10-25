import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Flash, flashFrom } from "@/components/ops/flash";
import { SubmitButton } from "@/components/ui/submit-button";
import { cn } from "@/lib/utils";
import { isPartPaid, money, moneyByCurrency, owedOf, stageOf, type ClientPayment } from "@/lib/client-payments";
import { dublinDate } from "@/lib/ops-core";
import { getClientPayments } from "../../data";
import { QuickAction, StagePill } from "../../parts";
import { deletePayment, savePayment } from "../../actions";

export const metadata = { title: "Client payments · Accounts" };

const field = "h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-sm text-ink focus:border-brand-400 focus:outline-none";
const label = "grid gap-1 text-xs font-semibold text-ink-muted";

/** One client's payment record: every billing line (newest first), what's owed, and forms to add or update. */
export default async function ClientPaymentsPage(props: PageProps<"/d/accounts/client/[id]">) {
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sp = await props.searchParams;
  const { client, payments: mine } = await getClientPayments(id);
  if (!client) notFound();
  const today = dublinDate();
  const back = `/d/accounts/client/${id}`;
  const sum = (pick: (p: ClientPayment) => number, keep: (p: ClientPayment) => boolean = () => true) => {
    const out: Record<string, number> = {};
    for (const p of mine) if (keep(p)) out[p.currency] = (out[p.currency] ?? 0) + pick(p);
    return out;
  };
  const billed = sum((p) => Number(p.amount));
  const paid = sum((p) => Number(p.paid_amount));
  const owed = sum(owedOf, (p) => stageOf(p, today) !== "paid" && !!p.invoice_no);
  const owedAny = Object.values(owed).some((v) => v > 0.005);
  const late = mine.filter((p) => stageOf(p, today) === "not-paid");
  const vaNames = [...new Set(mine.map((p) => p.va_name).filter(Boolean))] as string[];
  const latestVas = [...new Set(mine.filter((p) => p.period_start === mine[0]?.period_start).map((p) => p.va_name).filter(Boolean))];

  // group by period, newest first
  const periods = new Map<string, ClientPayment[]>();
  for (const p of mine) periods.set(p.period_label, [...(periods.get(p.period_label) ?? []), p]);

  return (
    <div className="space-y-5">
      <div>
        <Link href="/d/accounts" className="inline-flex items-center gap-1 text-xs text-ink-faint hover:text-ink">
          <ChevronLeft className="h-3.5 w-3.5" /> All clients
        </Link>
        <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h1 className="text-xl font-semibold tracking-tight text-ink">{client.name}</h1>
          <span className="text-sm capitalize text-ink-faint">
            {client.pipeline === "ai" ? "AI receptionist" : "VA"} · {client.status}
            {client.country ? ` · ${client.country}` : ""}
          </span>
        </div>
        {latestVas.length > 0 && <p className="mt-1 text-sm text-ink-muted">VAs: {latestVas.join(", ")}</p>}
      </div>
      <Flash msg={flashFrom(sp)} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ["Billed", moneyByCurrency(billed), `${mine.length} billing line${mine.length === 1 ? "" : "s"}`, ""],
          ["Paid", moneyByCurrency(paid), "received so far", "text-emerald-600 dark:text-emerald-400"],
          ["Owed", moneyByCurrency(owed), "invoiced, not paid", owedAny ? "text-ink" : ""],
          ["Not paid yet", String(late.length), late.length ? `${moneyByCurrency(sum(owedOf, (p) => stageOf(p, today) === "not-paid"))} past due` : "nothing past due", late.length ? "text-red-600 dark:text-red-400" : ""],
        ].map(([k, v, n, tone]) => (
          <div key={k} className="rounded-2xl border border-line bg-surface px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{k}</p>
            <p className={cn("mt-1 text-2xl font-semibold tabular-nums text-ink", tone)}>{v}</p>
            <p className="text-xs text-ink-muted">{n}</p>
          </div>
        ))}
      </div>

      <details className="rounded-2xl border border-line bg-surface" open={mine.length === 0}>
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-brand-600">+ Add a payment</summary>
        <PaymentForm clientId={id} back={back} vaNames={vaNames} />
      </details>

      {mine.length === 0 ? (
        <p className="text-sm text-ink-muted">No payments recorded for this client yet.</p>
      ) : (
        <div className="space-y-4">
          {[...periods.entries()].map(([period, lines]) => (
            <section key={period} className="rounded-2xl border border-line bg-surface">
              <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-2.5">
                <h2 className="text-sm font-semibold text-ink">{period}</h2>
                <span className="text-xs text-ink-muted">
                  {moneyByCurrency(lines.reduce<Record<string, number>>((o, p) => ({ ...o, [p.currency]: (o[p.currency] ?? 0) + Number(p.amount) }), {}))} billed ·{" "}
                  {moneyByCurrency(lines.reduce<Record<string, number>>((o, p) => ({ ...o, [p.currency]: (o[p.currency] ?? 0) + Number(p.paid_amount) }), {}))} paid
                </span>
              </header>
              <ul className="divide-y divide-line">
                {lines.map((p) => {
                  const stage = stageOf(p, today);
                  return (
                    <li key={p.id} className="space-y-2 px-4 py-3">
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                        <span className="min-w-[10rem] font-medium text-ink">{p.va_name || "No VA"}</span>
                        <span className="tabular-nums text-ink">
                          {money(p.amount, p.currency)}
                          {p.hours != null && <span className="ml-1 text-xs text-ink-faint">· {p.hours} h</span>}
                        </span>
                        <span className="text-ink-muted">{p.invoice_no ? `Invoice ${p.invoice_no}` : "No invoice yet"}</span>
                        <StagePill stage={stage} part={isPartPaid(p)} />
                        {isPartPaid(p) && <span className="text-xs text-red-600 dark:text-red-400">{money(owedOf(p), p.currency)} still owed</span>}
                        <span className="ml-auto">
                          <QuickAction p={p} today={today} back={back} />
                        </span>
                      </div>
                      {p.note && <p className="text-xs text-ink-faint">{p.note}</p>}
                      <details>
                        <summary className="cursor-pointer text-xs font-medium text-ink-faint hover:text-ink">Edit this line</summary>
                        <PaymentForm clientId={id} back={back} vaNames={vaNames} p={p} />
                        <form action={deletePayment} className="flex flex-wrap items-center gap-2 px-4 pb-3">
                          <input type="hidden" name="id" value={p.id} />
                          <input type="hidden" name="updated_at" value={p.updated_at} />
                          <input type="hidden" name="back" value={back} />
                          <input name="confirm" placeholder="Type DELETE" autoComplete="off" className={cn(field, "w-36")} />
                          <SubmitButton variant="danger" size="sm" pendingText="Removing…">Remove this line</SubmitButton>
                        </form>
                      </details>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/** Add a payment line, or edit every field of one. */
function PaymentForm({ clientId, back, vaNames, p }: { clientId: string; back: string; vaNames: string[]; p?: ClientPayment }) {
  const listId = `vas-${p?.id ?? "new"}`;
  return (
    <form action={savePayment} className="grid grid-cols-1 gap-3 px-4 pb-4 pt-1 sm:grid-cols-2 lg:grid-cols-4">
      {p && <input type="hidden" name="id" value={p.id} />}
      {p && <input type="hidden" name="updated_at" value={p.updated_at} />}
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="back" value={back} />
      <label className={label}>
        Period *
        <input name="period_label" required defaultValue={p?.period_label ?? ""} placeholder="1-15 November 2026" className={field} />
      </label>
      <label className={label}>
        VA
        <input name="va_name" list={listId} defaultValue={p?.va_name ?? ""} className={field} />
        <datalist id={listId}>
          {vaNames.map((v) => (
            <option key={v} value={v} />
          ))}
        </datalist>
      </label>
      <label className={label}>
        Hours
        <input name="hours" inputMode="decimal" defaultValue={p?.hours ?? ""} className={field} />
      </label>
      <label className={label}>
        Amount *
        <span className="flex gap-1.5">
          <input name="amount" inputMode="decimal" required defaultValue={p ? Number(p.amount).toFixed(2) : ""} className={field} />
          <select name="currency" defaultValue={p?.currency ?? "EUR"} className={cn(field, "w-20")}>
            {["EUR", "GBP", "USD", "NZD", "AUD", "CAD"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </span>
      </label>
      <label className={label}>
        Invoice no.
        <input name="invoice_no" defaultValue={p?.invoice_no ?? ""} className={field} />
      </label>
      <label className={label}>
        Invoice date
        <input type="date" name="invoiced_on" defaultValue={p?.invoiced_on ?? ""} className={field} />
      </label>
      <label className={label}>
        Due date
        <input type="date" name="due_on" defaultValue={p?.due_on ?? ""} className={field} />
      </label>
      <label className={label}>
        Total received
        <input name="paid_amount" inputMode="decimal" defaultValue={p ? Number(p.paid_amount).toFixed(2) : ""} className={field} />
      </label>
      <label className={label}>
        Date paid
        <input type="date" name="paid_on" defaultValue={p?.paid_on ?? ""} className={field} />
      </label>
      <label className={cn(label, "sm:col-span-2 lg:col-span-3")}>
        Note
        <input name="note" defaultValue={p?.note ?? ""} className={field} />
      </label>
      <div className="flex items-end">
        <SubmitButton size="sm" pendingText="Saving…">{p ? "Save changes" : "Add payment"}</SubmitButton>
      </div>
    </form>
  );
}
