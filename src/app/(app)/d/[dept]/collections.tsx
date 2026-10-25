import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { requireArea } from "@/lib/auth";
import { getMirror } from "@/lib/server/mirror";
import { bucketOf, euro, parsePayRuns, pct, reminderEmail, type PayBucket, type PayLine, type PayStatus } from "@/lib/mirror";
import { relativeTime, cn } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { Card, CardBody, EmptyState } from "@/components/ui/primitives";
import { Tabs } from "@/components/motion/tabs";
import { ReminderDraft } from "./reminder-draft";

/** The synced copy of Customer Payments › " Client VA Payments" (key set in the sync script). */
const PAYMENTS_KEY = "acc-client-payments";
const PILL: Record<PayStatus, string> = {
  Paid: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  "Part paid": "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  Unpaid: "bg-red-500/12 text-red-700 dark:text-red-300",
  "Not invoiced": "bg-fill-strong text-ink-muted",
};
const LISTS = ["remind", "check", "paid", "all"] as const;
type List = (typeof LISTS)[number];
const LIST_LABEL: Record<List, string> = { remind: "Needs a reminder", check: "Needs checking", paid: "Paid", all: "All lines" };

/**
 * Accounts › Collections: Maria's pay-runs as three worklists. Pick a pay-run, then see
 * who needs a reminder (with a ready-to-paste email), which lines need checking and why, and who paid.
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
        <EmptyState>The payments sheet hasn&apos;t been copied in yet.</EmptyState>
      </div>
    );
  }

  const recent = runs.slice(-8).reverse(); // newest first
  // open on the latest pay-run that has started collecting (the next one is often pre-filled and all unpaid)
  const run = recent.find((r) => r.label === searchParams.run) ?? recent.find((r) => r.received > 0) ?? recent[0];
  const notStarted = run.received === 0;
  const month = runs.filter((r) => r.month === run.month);
  const mInv = month.reduce((a, r) => a + r.invoiced, 0);
  const mGot = month.reduce((a, r) => a + r.received, 0);

  const sorted = run.lines.map((l) => ({ l, ...bucketOf(l) }));
  const of = (b: PayBucket) => sorted.filter((x) => x.bucket === b);
  const remind = of("remind");
  const check = of("check");
  const paid = of("paid");
  const owed = run.lines.reduce((a, l) => a + Math.max(l.invoice - l.received, 0), 0);
  const counts: Record<List, number> = { remind: remind.length, check: check.length, paid: paid.length, all: run.lines.length };
  const want = typeof searchParams.list === "string" ? searchParams.list : "";
  const list: List = (LISTS as readonly string[]).includes(want) ? (want as List) : remind.length ? "remind" : check.length ? "check" : "paid";
  const href = (extra: Record<string, string>) => "/d/accounts?" + new URLSearchParams({ run: run.label, ...extra }).toString();

  // one reminder per client: all of that client's unpaid lines in this pay-run together
  const byClient = new Map<string, PayLine[]>();
  for (const { l } of remind) byClient.set(l.client, [...(byClient.get(l.client) ?? []), l]);
  const clients = [...byClient.entries()].sort((a, b) => sum(b[1]) - sum(a[1]));

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
        <Stat label={`Invoiced · ${run.label}`} value={euro(run.invoiced)} note={`${run.lines.length} lines`} />
        <Stat label="Collected" value={euro(run.received)} note={`${pct(run.received, run.invoiced)}% of invoiced`} tone="good" />
        <Stat label="Still owed" value={euro(owed)} note={`${clients.length} client${clients.length === 1 ? "" : "s"} to remind`} tone={owed > 0 ? "bad" : undefined} />
        <Stat label="Needs checking" value={String(check.length)} note="see the reasons" tone={check.length ? "warn" : undefined} />
      </div>

      <div className="flex flex-wrap gap-2">
        {LISTS.map((k) => (
          <Link
            key={k}
            href={href({ list: k })}
            aria-current={list === k ? "page" : undefined}
            className={cn(
              "rounded-xl border px-3.5 py-2 text-sm font-semibold",
              list === k ? "border-brand-600 bg-brand-600 text-white" : "border-line text-ink-muted hover:bg-fill hover:text-ink",
            )}
          >
            {LIST_LABEL[k]}
            <span className={cn("ml-2 rounded-full px-1.5 text-xs", list === k ? "bg-white/25" : k === "remind" && counts[k] ? "bg-red-500/12 text-red-700 dark:text-red-300" : k === "check" && counts[k] ? "bg-amber-500/15 text-amber-700 dark:text-amber-300" : "bg-fill")}>
              {counts[k]}
            </span>
          </Link>
        ))}
      </div>

      {list === "remind" &&
        (clients.length ? (
          <div className="space-y-3">
            <p className="text-sm text-ink-muted">
              {notStarted
                ? `Nothing has been collected for ${run.label} yet, so every line shows here. Send reminders once these invoices are due.`
                : `Unpaid in ${run.label}. One email per client covers all of their unpaid lines.`}
            </p>
            {clients.map(([client, lines]) => {
              const email = reminderEmail(client, lines, run.label);
              return (
                <Card key={client}>
                  <CardBody className="space-y-2.5">
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <span className="text-base font-semibold text-ink">{client}</span>
                      {lines[0].country && <span className="text-xs text-ink-faint">{lines[0].country}</span>}
                      <span className="ml-auto text-base font-semibold tabular-nums text-red-600 dark:text-red-400">{euro(sum(lines))}</span>
                    </div>
                    <ul className="space-y-1 text-sm">
                      {lines.map((l) => (
                        <li key={l.row} className="flex flex-wrap gap-x-3 text-ink-muted">
                          <span>VA {l.va}</span>
                          <span className="text-ink">{l.xero || "no invoice no."}</span>
                          <span className="tabular-nums">{euro(l.invoice - l.received)}</span>
                          {(l.remark || l.notes) && <span className="w-full text-xs text-ink-faint">Maria&apos;s note: {[l.remark, l.notes].filter(Boolean).join(" · ")}</span>}
                        </li>
                      ))}
                    </ul>
                    <ReminderDraft subject={email.subject} body={email.body} />
                  </CardBody>
                </Card>
              );
            })}
          </div>
        ) : (
          <EmptyState>Nobody needs a reminder for {run.label}.</EmptyState>
        ))}

      {list === "check" &&
        (check.length ? (
          <Card>
            <CardBody className="p-0">
              <ul className="divide-y divide-line">
                {check.map(({ l, reason }) => (
                  <li key={l.row} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-5 py-3 text-sm">
                    <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-300">{reason}</span>
                    <span className="font-semibold text-ink">{l.client}</span>
                    <span className="text-ink-muted">VA {l.va}</span>
                    <span className="ml-auto tabular-nums text-ink">{l.invoice ? euro(l.invoice) : "—"}</span>
                    <span className="w-full text-xs text-ink-faint">
                      {[l.xero, l.datePaid && `paid ${l.datePaid}`, l.sheetStatus && `status: ${l.sheetStatus}`, l.remark, l.notes].filter(Boolean).join(" · ") ||
                        `Sheet row ${l.row}`}
                    </span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        ) : (
          <EmptyState>Nothing to check in {run.label}.</EmptyState>
        ))}

      {list === "paid" && (paid.length ? <LineTable lines={paid.map((x) => x.l)} /> : <EmptyState>No payments received yet for {run.label}.</EmptyState>)}

      {list === "all" && <LineTable lines={run.lines} />}
    </div>
  );
}

const sum = (lines: PayLine[]) => lines.reduce((a, l) => a + l.invoice - l.received, 0);

function LineTable({ lines }: { lines: PayLine[] }) {
  return (
    <Card>
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
              <tr key={l.row} className="align-top">
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
