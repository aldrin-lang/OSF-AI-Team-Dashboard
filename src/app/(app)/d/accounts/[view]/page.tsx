import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Flash, flashFrom } from "@/components/ops/flash";
import { EmptyState } from "@/components/ui/primitives";
import { cn } from "@/lib/utils";
import { moneyByCurrency, STAGE_LABEL, STAGES, type Stage } from "@/lib/client-payments";
import { accountsCtx, getStageLines, getStageTotals } from "../data";
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
  const ctx = await accountsCtx();
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 80) : "";
  const period = typeof sp.period === "string" ? sp.period.slice(0, 80) : "";
  const askedPage = Math.max(1, Number(sp.page) || 1);
  const [{ rows: shown, total: count, periods }, { totals, receivedThisMonth }] = await Promise.all([
    getStageLines(ctx, stage, { q, period, page: askedPage, pageSize: PAGE }),
    getStageTotals(ctx),
  ]);
  const pages = Math.max(1, Math.ceil(count / PAGE));
  const page = Math.min(askedPage, pages);
  // the money shown next to the count: the whole tab (all pages), from the totals
  const t = totals[stage];
  const total = !q && !period ? moneyByCurrency(stage === "for-invoice" ? t.amount : stage === "paid" ? t.amount : t.owed) : null;
  const qs = (extra: Record<string, string>) => {
    const u = new URLSearchParams({ ...(q ? { q } : {}), ...(period ? { period } : {}), ...extra });
    return `/d/accounts/${stage}${u.toString() ? `?${u}` : ""}`;
  };
  const back = qs(page > 1 ? { page: String(page) } : {});

  return (
    <div className="space-y-5">
      <PageHeader title={STAGE_LABEL[stage]} subtitle={BLURB[stage]} />
      <Flash msg={flashFrom(sp)} />
      <StageTiles totals={totals} receivedThisMonth={receivedThisMonth} />

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
          {count} line{count === 1 ? "" : "s"}
          {total && (
            <>
              {" "}· <span className="font-semibold text-ink">{total}</span>
            </>
          )}
        </span>
      </form>

      {shown.length ? (
        <PaymentTable rows={shown} today={ctx.today} back={back} />
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
