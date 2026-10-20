import Link from "next/link";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireArea } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardBody, EmptyState } from "@/components/ui/primitives";
import { Tabs } from "@/components/motion/tabs";
import { allRows } from "@/lib/server/paged";
import { formatDate, relativeTime } from "@/lib/utils";
import type { OpsNumber, OpsNumberCell } from "@/lib/types";

export const metadata = { title: "Team numbers · OSF AI Team Dashboard" };

const VIEWS = { daily: "Daily numbers", accounts: "Accounts" } as const;
type View = keyof typeof VIEWS;
const DAYS = 10;
const isIso = (s: unknown): s is string => typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s);
/** Sheet errors (#DIV/0!, #REF!) are shown as a dash. */
const shown = (v: string) => (!v || v.startsWith("#") ? "—" : v);
const shortDay = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-IE", { day: "numeric", month: "short", timeZone: "UTC" });

export default async function TeamNumbersPage(props: PageProps<"/reports/team">) {
  await requireArea("reports");
  const sp = await props.searchParams;
  const view: View = sp.view === "accounts" ? "accounts" : "daily";
  const supabase = await getServerSupabase();
  const rows = (await allRows((a, b) =>
    supabase.from("ops_numbers").select("*").eq("source", view === "daily" ? "daily_numbers" : "accounts").order("position").order("id").range(a, b),
  )) as OpsNumber[];
  const imported = rows.reduce<string | null>((m, r) => (!m || r.imported_at > m ? r.imported_at : m), null);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Team numbers"
        subtitle={`Copied from the team's Google Sheets${imported ? ` · updated ${relativeTime(imported)}` : ""}`}
        actions={
          <Link href="/reports" className="text-sm font-medium text-brand-600 hover:underline">
            ← Reports
          </Link>
        }
      />
      <Tabs active={view} items={(Object.keys(VIEWS) as View[]).map((k) => ({ key: k, href: `/reports/team?view=${k}`, label: VIEWS[k] }))} />
      {!rows.length ? (
        <EmptyState>No numbers imported yet.</EmptyState>
      ) : view === "daily" ? (
        <Daily rows={rows} end={isIso(sp.end) ? sp.end : null} />
      ) : (
        <Accounts rows={rows} fy={typeof sp.fy === "string" ? sp.fy : null} />
      )}
    </div>
  );
}

function Value({ c }: { c: OpsNumberCell | undefined }) {
  if (!c) return <span className="text-ink-faint">·</span>;
  return (
    <span title={c.n} className={c.n ? "cursor-help" : undefined}>
      {shown(c.v)}
      {c.n && <span className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-orange-400 align-super" aria-label="has a note" />}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Daily numbers: one card per department, metrics × the last 10 days
// ---------------------------------------------------------------------------
function Daily({ rows, end }: { rows: OpsNumber[]; end: string | null }) {
  const allDays = [...new Set(rows.flatMap((r) => r.cells.map((c) => c.k)))].filter(isIso).sort();
  const lastIdx = end ? allDays.filter((d) => d <= end).length - 1 : allDays.length - 1;
  const days = allDays.slice(Math.max(0, lastIdx - DAYS + 1), lastIdx + 1);
  const earlier = allDays[Math.max(0, lastIdx - DAYS)];
  const later = allDays[Math.min(allDays.length - 1, lastIdx + DAYS)];
  const sections = [...new Set(rows.map((r) => r.section))];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between text-sm">
        <span className="text-ink-muted">
          {days.length ? `${formatDate(days[0])} – ${formatDate(days[days.length - 1])}` : "No days"}
        </span>
        <span className="flex gap-3">
          {lastIdx - DAYS >= 0 && (
            <Link href={`/reports/team?view=daily&end=${earlier}`} className="font-medium text-brand-600 hover:underline">
              ← Earlier
            </Link>
          )}
          {lastIdx < allDays.length - 1 && (
            <Link href={`/reports/team?view=daily&end=${later}`} className="font-medium text-brand-600 hover:underline">
              Later →
            </Link>
          )}
        </span>
      </div>
      {sections.map((s) => {
        const list = rows.filter((r) => r.section === s);
        const inView = list.filter((r) => r.cells.some((c) => days.includes(c.k)));
        const owners = [...new Set(list.map((r) => r.owner).filter(Boolean))].join(", ");
        const notes = inView.flatMap((r) => r.cells.filter((c) => c.n && days.includes(c.k)).map((c) => ({ day: c.k, metric: r.label, q: r.sub_label, note: c.n! })));
        return (
          <Card key={s}>
            <CardHeader>
              <CardTitle>
                {s}
                {owners && <span className="ml-2 text-sm font-normal text-ink-muted">· {owners}</span>}
              </CardTitle>
            </CardHeader>
            <CardBody className="overflow-x-auto">
              {!inView.length ? (
                <p className="text-sm text-ink-faint">No numbers on these days.</p>
              ) : (
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-ink-faint">
                      <th className="sticky left-0 bg-surface pb-2 pr-3 font-medium">Metric</th>
                      <th className="pb-2 pr-3 font-medium">Target</th>
                      {days.map((d) => (
                        <th key={d} className="whitespace-nowrap pb-2 pr-3 text-right font-medium">
                          {shortDay(d)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {inView.map((r) => {
                      const byDay = new Map(r.cells.map((c) => [c.k, c]));
                      return (
                        <tr key={r.id} className="border-t border-line">
                          <td className="sticky left-0 bg-surface py-1.5 pr-3 text-ink">
                            {r.label}
                            {r.sub_label && <span className="ml-1 text-xs text-ink-faint">{r.sub_label}</span>}
                          </td>
                          <td className="py-1.5 pr-3 text-ink-muted">{r.target ?? "—"}</td>
                          {days.map((d) => (
                            <td key={d} className="py-1.5 pr-3 text-right tabular-nums">
                              <Value c={byDay.get(d)} />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {notes.length > 0 && (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-ink-muted">Notes on these days ({notes.length})</summary>
                  <ul className="mt-2 space-y-2">
                    {notes.map((x, i) => (
                      <li key={i}>
                        <span className="text-xs text-ink-faint">
                          {shortDay(x.day)} · {x.metric}
                          {x.q ? ` ${x.q}` : ""}
                        </span>
                        <p className="whitespace-pre-wrap text-ink-muted">{x.note}</p>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Accounts: one financial year at a time, months × KPIs
// ---------------------------------------------------------------------------
function Accounts({ rows, fy }: { rows: OpsNumber[]; fy: string | null }) {
  const years = [...new Set(rows.map((r) => r.section))].sort().reverse();
  const year = fy && years.includes(fy) ? fy : years[0];
  const list = rows.filter((r) => r.section === year);
  const kpis: string[] = [];
  for (const r of list) for (const c of r.cells) if (!kpis.includes(c.k)) kpis.push(c.k);
  const notes = list.flatMap((r) => r.cells.filter((c) => c.n).map((c) => ({ when: [r.label, r.sub_label].filter(Boolean).join(" · "), kpi: c.k, note: c.n! })));

  return (
    <div className="space-y-4">
      <Tabs variant="pill" active={year} items={years.map((y) => ({ key: y, href: `/reports/team?view=accounts&fy=${y}`, label: y }))} />
      <Card>
        <CardHeader>
          <CardTitle>{year}</CardTitle>
        </CardHeader>
        <CardBody className="overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: `${180 + kpis.length * 120}px` }}>
            <thead>
              <tr className="text-left text-xs text-ink-faint">
                <th className="sticky left-0 bg-surface pb-2 pr-3 font-medium">Month</th>
                {kpis.map((k) => (
                  <th key={k} className="w-[120px] pb-2 pr-3 text-right align-bottom font-medium">
                    {k}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((r) => {
                const byKpi = new Map(r.cells.map((c) => [c.k, c]));
                return (
                  <tr key={r.id} className={`border-t border-line ${r.sub_label ? "text-ink-muted" : ""}`}>
                    <td className={`sticky left-0 bg-surface py-1.5 pr-3 ${r.sub_label ? "pl-4 text-xs" : "font-medium text-ink"}`}>
                      {r.sub_label || r.label}
                    </td>
                    {kpis.map((k) => (
                      <td key={k} className="py-1.5 pr-3 text-right tabular-nums">
                        <Value c={byKpi.get(k)} />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {notes.length > 0 && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-ink-muted">Notes ({notes.length})</summary>
              <ul className="mt-2 space-y-2">
                {notes.map((x, i) => (
                  <li key={i}>
                    <span className="text-xs text-ink-faint">
                      {x.when} · {x.kpi}
                    </span>
                    <p className="whitespace-pre-wrap text-ink-muted">{x.note}</p>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
