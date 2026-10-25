import Link from "next/link";
import { cn } from "@/lib/utils";
import { SubmitButton } from "@/components/ui/submit-button";
import { isPartPaid, money, moneyByCurrency, owedOf, stageOf, STAGE_LABEL, type ClientPayment, type Stage } from "@/lib/client-payments";
import type { PaymentLine, StageTotals } from "./data";
import { markInvoiced, markPaid } from "./actions";

export const STAGE_PILL: Record<Stage, string> = {
  "for-invoice": "bg-sky-500/12 text-sky-700 dark:text-sky-300",
  "for-collection": "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  "not-paid": "bg-red-500/12 text-red-700 dark:text-red-300",
  paid: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
};

export function StagePill({ stage, part }: { stage: Stage; part?: boolean }) {
  return (
    <span className={cn("inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold", STAGE_PILL[stage])}>
      {part && stage !== "paid" ? "Part paid" : STAGE_LABEL[stage]}
    </span>
  );
}

const shortDate = (iso: string | null) =>
  iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "";

const field = "h-8 rounded-lg border border-line bg-surface px-2 text-sm text-ink focus:border-brand-400 focus:outline-none";

/** The quick action for a line: record the invoice number, or record the payment. */
export function QuickAction({ p, today, back }: { p: ClientPayment; today: string; back: string }) {
  const stage = stageOf(p, today);
  if (stage === "for-invoice") {
    return (
      <form action={markInvoiced} className="flex flex-wrap items-center gap-1.5">
        <input type="hidden" name="id" value={p.id} />
        <input type="hidden" name="updated_at" value={p.updated_at} />
        <input type="hidden" name="back" value={back} />
        <input name="invoice_no" placeholder="Invoice no." aria-label="Invoice number" className={cn(field, "w-28")} required />
        <input type="date" name="invoiced_on" defaultValue={today} aria-label="Invoice date" className={cn(field, "w-36")} />
        <SubmitButton size="sm" pendingText="Saving…">Invoiced</SubmitButton>
      </form>
    );
  }
  if (stage === "paid") return <span className="text-xs text-ink-muted">Paid {p.paid_on ? shortDate(p.paid_on) : "(date not recorded)"}</span>;
  return (
    <form action={markPaid} className="flex flex-wrap items-center gap-1.5" title="Total received so far for this line (not just the latest instalment)">
      <input type="hidden" name="id" value={p.id} />
      <input type="hidden" name="updated_at" value={p.updated_at} />
      <input type="hidden" name="back" value={back} />
      <input name="paid_amount" defaultValue={(Number(p.amount) || 0).toFixed(2)} aria-label="Total received so far" className={cn(field, "w-24 text-right tabular-nums")} required />
      <input type="date" name="paid_on" defaultValue={today} aria-label="Date paid" className={cn(field, "w-36")} />
      <SubmitButton size="sm" pendingText="Saving…">Mark paid</SubmitButton>
    </form>
  );
}

/** Payment lines as a table: client (link to their record), VA, period, amount, invoice, status, action. */
export function PaymentTable({
  rows,
  names,
  today,
  back,
  showClient = true,
}: {
  rows: PaymentLine[];
  names?: Map<string, string>;
  today: string;
  back: string;
  showClient?: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
      <table className="w-full min-w-[900px] text-sm">
        <thead>
          <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
            {showClient && <th className="px-4 py-2.5 font-semibold">Client</th>}
            <th className="px-3 py-2.5 font-semibold">VA</th>
            <th className="px-3 py-2.5 font-semibold">Period</th>
            <th className="px-3 py-2.5 text-right font-semibold">Amount</th>
            <th className="px-3 py-2.5 font-semibold">Invoice</th>
            <th className="px-3 py-2.5 font-semibold">Status</th>
            <th className="px-4 py-2.5 font-semibold">Update</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((p) => {
            const stage = stageOf(p, today);
            return (
              <tr key={p.id} className="align-top">
                {showClient && (
                  <td className="px-4 py-2.5">
                    <Link href={`/d/accounts/client/${p.client_id}`} className="font-semibold text-ink hover:text-brand-600 hover:underline">
                      {p.client_name ?? names?.get(p.client_id) ?? "Client"}
                    </Link>
                  </td>
                )}
                <td className="px-3 py-2.5 text-ink-muted">{p.va_name || "—"}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-ink">{p.period_label}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">
                  <span className="font-semibold text-ink">{money(p.amount, p.currency)}</span>
                  {isPartPaid(p) && <span className="block text-xs text-red-600 dark:text-red-400">{money(owedOf(p), p.currency)} owed</span>}
                </td>
                <td className="px-3 py-2.5 text-ink-muted">
                  {p.invoice_no || "—"}
                  {p.due_on && stage !== "paid" && stage !== "for-invoice" && <span className="block text-xs text-ink-faint">due {shortDate(p.due_on)}</span>}
                </td>
                <td className="px-3 py-2.5">
                  <StagePill stage={stage} part={isPartPaid(p)} />
                  {p.note && <span className="mt-1 block max-w-[220px] text-xs text-ink-faint">{p.note}</span>}
                </td>
                <td className="px-4 py-2.5">
                  <QuickAction p={p} today={today} back={back} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Totals per tab (from the database), shown on every Accounts page. Currencies are never added together. */
export function StageTiles({ totals, receivedThisMonth }: { totals: StageTotals; receivedThisMonth: Record<string, number> }) {
  const tiles: { s: Stage; href: string; note: string }[] = [
    { s: "for-invoice", href: "/d/accounts/for-invoice", note: `${moneyByCurrency(totals["for-invoice"].amount)} to invoice` },
    { s: "for-collection", href: "/d/accounts/for-collection", note: `${moneyByCurrency(totals["for-collection"].owed)} coming in` },
    { s: "not-paid", href: "/d/accounts/not-paid", note: `${moneyByCurrency(totals["not-paid"].owed)} past due` },
    { s: "paid", href: "/d/accounts/paid", note: `${moneyByCurrency(receivedThisMonth)} marked paid this month` },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((t) => (
        <Link key={t.s} href={t.href} className="rounded-2xl border border-line bg-surface px-4 py-3 transition-colors hover:border-brand-400">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{STAGE_LABEL[t.s]}</span>
            <StagePill stage={t.s} />
          </div>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">{totals[t.s].lines}</p>
          <p className="text-xs text-ink-muted">{t.note}</p>
        </Link>
      ))}
    </div>
  );
}
