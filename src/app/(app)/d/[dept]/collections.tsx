import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { requireArea } from "@/lib/auth";
import { getMirror } from "@/lib/server/mirror";
import { euro, parsePayRuns, pct, type PayLine, type PayStatus } from "@/lib/mirror";
import { relativeTime, cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, CardHeader, CardTitle, EmptyState } from "@/components/ui/primitives";
import { Tabs } from "@/components/motion/tabs";

/** The synced copy of Customer Payments › " Client VA Payments" (key set in the sync script). */
const PAYMENTS_KEY = "acc-client-payments";
const STATUSES: PayStatus[] = ["Unpaid", "Part paid", "Paid", "Not invoiced"];
const PILL: Record<PayStatus, string> = {
  Paid: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  "Part paid": "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  Unpaid: "bg-red-500/12 text-red-700 dark:text-red-300",
  "Not invoiced": "bg-fill-strong text-ink-muted",
};

/**
 * Accounts › Collections: Maria's pay-runs made easy to read. Pick a pay-run and see
 * how much was invoiced and collected, who still owes, and who wasn't invoiced and why.
 */
export async function Collections({ searchParams }: { searchParams: Record<string, string | string[] | undefined> }) {
  await requireArea("payments");
  const grid = await getMirror(PAYMENTS_KEY);
  const runs = grid ? parsePayRuns(grid.rows).filter((r) => r.lines.length) : [];

  const header = (
    <PageHeader
      title="Collections"
      subtitle={
        grid
          ? `From ${grid.meta.source_name} · updated ${relativeTime(grid.meta.synced_at)}`
          : "From Customer Payments › Client VA Payments"
      }
      actions={
        grid?.meta.source_url ? (
          <a href={grid.meta.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline">
            Open in Google Sheets <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : undefined
      }
    />
  );
  if (!runs.length) {
    return (
      <div className="space-y-4">
        {header}
        <EmptyState>The payments sheet hasn&apos;t synced yet. It appears here within 30 minutes of the sync being switched on.</EmptyState>
      </div>
    );
  }

  const recent = runs.slice(-8).reverse(); // newest first
  const want = typeof searchParams.run === "string" ? searchParams.run : "";
  const run = recent.find((r) => r.label === want) ?? recent[0];
  const status = STATUSES.find((s) => s === searchParams.status) ?? null;
  const month = runs.filter((r) => r.month === run.month);
  const mInv = month.reduce((a, r) => a + r.invoiced, 0);
  const mGot = month.reduce((a, r) => a + r.received, 0);
  const unpaid = run.lines.filter((l) => l.status === "Unpaid" || l.status === "Part paid").sort((a, b) => b.invoice - b.received - (a.invoice - a.received));
  const notInvoiced = run.lines.filter((l) => l.status === "Not invoiced");
  const owed = unpaid.reduce((a, l) => a + l.invoice - l.received, 0);
  const lines = status ? run.lines.filter((l) => l.status === status) : run.lines;
  const q = (extra: Record<string, string>) => "/d/accounts?" + new URLSearchParams({ run: run.label, ...extra }).toString();

  return (
    <div className="space-y-5">
      {header}

      <Tabs variant="pill" active={run.label} items={recent.map((r) => ({ key: r.label, href: "/d/accounts?" + new URLSearchParams({ run: r.label }).toString(), label: r.label }))} />

      <Card>
        <CardBody className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-sm font-semibold text-ink">{run.month} so far · all pay-runs</p>
            <p className="text-sm text-ink-muted">
              Collected <span className="font-semibold text-ink">{euro(mGot)}</span> of {euro(mInv)}
              <span className="ml-1.5 font-semibold text-ink">({pct(mGot, mInv)}%)</span>
            </p>
          </div>
          <Bar value={pct(mGot, mInv)} />
        </CardBody>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Invoiced this pay-run" value={euro(run.invoiced)} note={`${run.lines.length - notInvoiced.length} invoices`} />
        <Stat label="Collected" value={euro(run.received)} note={`${pct(run.received, run.invoiced)}% of invoiced`} tone="good" />
        <Stat label="Still owed" value={euro(owed)} note={`${unpaid.length} client line${unpaid.length === 1 ? "" : "s"} unpaid`} tone={owed > 0 ? "bad" : undefined} />
        <Stat label="Not invoiced" value={String(notInvoiced.length)} note="see reasons below" tone={notInvoiced.length ? "warn" : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Who still owes · {run.label}</CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            {unpaid.length ? (
              <ul className="divide-y divide-line">
                {unpaid.map((l) => (
                  <li key={l.row} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 px-5 py-2.5 text-sm">
                    <span className="font-semibold text-ink">{l.client}</span>
                    <span className="text-ink-muted">VA {l.va}</span>
                    <span className="ml-auto font-semibold tabular-nums text-red-600 dark:text-red-400">{euro(l.invoice - l.received)}</span>
                    <span className="w-full text-xs text-ink-faint">
                      {[l.xero, l.status === "Part paid" ? `paid ${euro(l.received)} of ${euro(l.invoice)}` : "", l.remark, l.notes].filter(Boolean).join(" · ")}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-6 text-sm text-ink-muted">Everyone in this pay-run has paid.</p>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Not invoiced · and why</CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            {notInvoiced.length ? (
              <ul className="divide-y divide-line">
                {notInvoiced.map((l) => (
                  <li key={l.row} className="px-5 py-2.5 text-sm">
                    <span className="font-semibold text-ink">{l.client}</span> <span className="text-ink-muted">· VA {l.va}</span>
                    <p className="text-xs text-ink-faint">{[l.remark, l.notes].filter(Boolean).join(" · ") || "No reason written in the sheet"}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-5 py-6 text-sm text-ink-muted">Every line in this pay-run was invoiced.</p>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle>All lines · {run.label}</CardTitle>
          <div className="flex flex-wrap gap-1.5 text-xs">
            <FilterLink href={q({})} active={!status}>All {run.lines.length}</FilterLink>
            {STATUSES.map((s) => {
              const n = run.lines.filter((l) => l.status === s).length;
              return n ? (
                <FilterLink key={s} href={q({ status: s })} active={status === s}>
                  {s} {n}
                </FilterLink>
              ) : null;
            })}
          </div>
        </CardHeader>
        <CardBody className="overflow-x-auto p-0">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="px-5 py-2 font-semibold">Client</th>
                <th className="px-3 py-2 font-semibold">VA</th>
                <th className="px-3 py-2 text-right font-semibold">Invoice</th>
                <th className="px-3 py-2 text-right font-semibold">Received</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Invoice no.</th>
                <th className="px-5 py-2 font-semibold">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {lines.map((l) => (
                <Line key={l.row} l={l} />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-line-strong font-semibold text-ink">
                <td className="px-5 py-2.5" colSpan={2}>
                  Total ({lines.length})
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums">{euro(lines.reduce((a, l) => a + l.invoice, 0))}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{euro(lines.reduce((a, l) => a + l.received, 0))}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}

function Line({ l }: { l: PayLine }) {
  return (
    <tr className="align-top">
      <td className="px-5 py-2 font-medium text-ink">
        {l.client}
        {l.country && <span className="ml-1.5 text-xs font-normal text-ink-faint">{l.country}</span>}
      </td>
      <td className="px-3 py-2 text-ink-muted">{l.va}</td>
      <td className="px-3 py-2 text-right tabular-nums text-ink">{l.invoice ? euro(l.invoice) : "—"}</td>
      <td className="px-3 py-2 text-right tabular-nums text-ink">{l.received ? euro(l.received) : "—"}</td>
      <td className="px-3 py-2">
        <span className={cn("inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold", PILL[l.status])}>{l.status}</span>
        {l.datePaid && <span className="ml-1.5 text-xs text-ink-faint">{l.datePaid}</span>}
      </td>
      <td className="px-3 py-2 text-ink-muted">{l.xero || "—"}</td>
      <td className="px-5 py-2 text-xs text-ink-muted">{[l.sheetStatus, l.remark, l.notes].filter(Boolean).join(" · ")}</td>
    </tr>
  );
}

function Stat({ label, value, note, tone }: { label: string; value: string; note: string; tone?: "good" | "bad" | "warn" }) {
  return (
    <Card>
      <CardBody>
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{label}</p>
        <p
          className={cn(
            "mt-1 text-2xl font-semibold tabular-nums",
            tone === "good" ? "text-emerald-600 dark:text-emerald-400" : tone === "bad" ? "text-red-600 dark:text-red-400" : tone === "warn" ? "text-amber-600 dark:text-amber-400" : "text-ink",
          )}
        >
          {value}
        </p>
        <p className="mt-0.5 text-xs text-ink-muted">{note}</p>
      </CardBody>
    </Card>
  );
}

function Bar({ value }: { value: number }) {
  return (
    <div className="h-2.5 overflow-hidden rounded-full bg-fill-strong" role="img" aria-label={`${value}% collected`}>
      <div className="h-full rounded-full bg-gradient-to-r from-brand-500 to-emerald-500" style={{ width: `${Math.min(value, 100)}%` }} />
    </div>
  );
}

function FilterLink({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={cn("rounded-full border px-2.5 py-1 font-medium", active ? "border-brand-600 bg-brand-600 text-white" : "border-line text-ink-muted hover:bg-fill")}
    >
      {children}
    </Link>
  );
}
