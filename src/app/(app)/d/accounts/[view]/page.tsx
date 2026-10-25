import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Flash, flashFrom } from "@/components/ops/flash";
import { EmptyState } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { money, owedOf, stageOf, STAGE_LABEL, STAGES, type Stage } from "@/lib/client-payments";
import { loadAccounts } from "../data";
import { PaymentTable, StageTiles } from "../parts";

const PAGE = 150;
const BLURB: Record<Stage, string> = {
  "for-invoice": "Billing lines without an invoice number yet. Add the invoice number when it's sent.",
  "for-collection": "Invoiced and not due yet. Mark paid when the money arrives.",
  "not-paid": "Past the due date and not fully paid.",
  paid: "Payments received.",
};

export async function generateMetadata(props: PageProps<"/d/accounts/[view]">) {
  const { view } = await props.params;
  return { title: `${STAGE_LABEL[view as Stage] ?? "Accounts"} · Accounts` };
}

/** Accounts › For invoice / For collection / Not paid yet / Paid: every payment line in that state. */
export default async function StagePage(props: PageProps<"/d/accounts/[view]">) {
  const { view } = await props.params;
  if (!(STAGES as readonly string[]).includes(view)) notFound();
  const stage = view as Stage;
  const sp = await props.searchParams;
  const { clients, payments, today } = await loadAccounts();
  const names = new Map(clients.map((c) => [c.id, c.name]));
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase().slice(0, 80) : "";
  const period = typeof sp.period === "string" ? sp.period : "";

  const inStage = payments.filter((p) => stageOf(p, today) === stage);
  const periods = [...new Map(inStage.map((p) => [p.period_label, p.period_start ?? ""])).entries()].sort((a, b) => b[1].localeCompare(a[1])).map(([l]) => l);
  const rows = inStage
    .filter((p) => !period || p.period_label === period)
    .filter((p) => !q || (names.get(p.client_id) ?? "").toLowerCase().includes(q) || (p.va_name ?? "").toLowerCase().includes(q) || (p.invoice_no ?? "").toLowerCase().includes(q))
    .sort((a, b) => (b.period_start ?? "").localeCompare(a.period_start ?? "") || (names.get(a.client_id) ?? "").localeCompare(names.get(b.client_id) ?? ""));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const page = Math.min(Math.max(1, Number(sp.page) || 1), pages);
  const shown = rows.slice((page - 1) * PAGE, page * PAGE);
  const total = rows.reduce((a, p) => a + (stage === "paid" ? Number(p.paid_amount) : stage === "for-invoice" ? Number(p.amount) : owedOf(p)), 0);
  const qs = (extra: Record<string, string>) => {
    const u = new URLSearchParams({ ...(q ? { q } : {}), ...(period ? { period } : {}), ...extra });
    return `/d/accounts/${stage}${u.toString() ? `?${u}` : ""}`;
  };
  const back = qs(page > 1 ? { page: String(page) } : {});

  return (
    <div className="space-y-5">
      <PageHeader title={STAGE_LABEL[stage]} subtitle={BLURB[stage]} />
      <Flash msg={flashFrom(sp)} />
      <StageTiles payments={payments} today={today} />

      <form method="get" action={`/d/accounts/${stage}`} className="flex flex-wrap items-center gap-3">
        <input
          name="q"
          defaultValue={q}
          placeholder="Client, VA or invoice no."
          className="h-9 w-64 rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-ink-faint focus:border-brand-400 focus:outline-none"
        />
        <select name="period" defaultValue={period} className="h-9 rounded-lg border border-line bg-surface px-2 text-sm text-ink">
          <option value="">All periods</option>
          {periods.map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
        <button className="h-9 rounded-lg border border-line px-3 text-sm font-medium text-ink-muted hover:bg-fill">Filter</button>
        <span className="text-sm text-ink-muted">
          {rows.length} line{rows.length === 1 ? "" : "s"} · <span className="font-semibold text-ink">{money(total)}</span>
        </span>
      </form>

      {shown.length ? (
        <PaymentTable rows={shown} names={names} today={today} back={back} />
      ) : (
        <EmptyState>Nothing in {STAGE_LABEL[stage]}{period ? ` for ${period}` : ""}.</EmptyState>
      )}

      {pages > 1 && (
        <nav className="flex flex-wrap gap-1.5 text-sm">
          {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
            <Link key={n} href={qs({ page: String(n) })} className={cn("rounded-lg border px-3 py-1.5", n === page ? "border-brand-600 bg-brand-600 text-white" : "border-line text-ink-muted hover:bg-fill")}>
              {n}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
