import Link from "next/link";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireArea, hasRole } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardBody, Input, EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Flash, flashFrom } from "@/components/ops/flash";
import { addDays, dublinDate, formatMoney, isIsoDate } from "@/lib/ops-core";
import { formatDate, relativeTime } from "@/lib/utils";
import type { DailyMetrics } from "@/lib/server/daily-report";
import type { DailyReport } from "@/lib/types";
import { generateReport } from "./actions";

export const metadata = { title: "Daily report · OSF AI Team Dashboard" };

function Stat({ label, value, hot }: { label: string; value: React.ReactNode; hot?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5 text-sm">
      <span className="text-ink-faint">{label}</span>
      <span className={`font-medium ${hot ? "text-rose-600" : "text-ink"}`}>{value}</span>
    </div>
  );
}

const pairs = (r: Record<string, number> | undefined) =>
  Object.entries(r ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v}`)
    .join(" · ") || "—";

const money = (r: Record<string, number> | undefined) =>
  Object.entries(r ?? {})
    .map(([c, v]) => formatMoney(v, c))
    .join(" + ") || "—";

export default async function DailyReportPage(props: PageProps<"/reports/daily">) {
  const profile = await requireArea("reports");
  const sp = await props.searchParams;
  const today = dublinDate();
  const d = typeof sp.date === "string" ? sp.date : "";
  const date = isIsoDate(d) && d <= today ? d : addDays(today, -1);
  const msg = flashFrom(sp);
  const supabase = await getServerSupabase();

  const [{ data }, { data: recent }] = await Promise.all([
    supabase.from("daily_reports").select("*").eq("report_date", date).maybeSingle(),
    supabase.from("daily_reports").select("report_date").order("report_date", { ascending: false }).limit(14),
  ]);
  const report = data as DailyReport | null;
  const m = report?.metrics as unknown as DailyMetrics | undefined;
  const isManager = hasRole(profile, "manager");

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Daily report"
        subtitle="What happened each day (Irish time). Built and emailed to managers every morning."
        actions={
          <Link href="/reports" className="text-sm text-ink-muted hover:text-ink">
            Reports
          </Link>
        }
      />
      <Flash msg={msg} />

      <div className="flex flex-wrap items-end gap-2">
        <Link href={`/reports/daily?date=${addDays(date, -1)}`}>
          <Button size="sm" variant="secondary">
            ← Previous day
          </Button>
        </Link>
        <form method="get" className="flex items-end gap-2">
          <Input name="date" type="date" defaultValue={date} max={today} className="w-44" />
          <Button size="sm" variant="secondary" type="submit">
            Go
          </Button>
        </form>
        {date < today && (
          <Link href={`/reports/daily?date=${addDays(date, 1)}`}>
            <Button size="sm" variant="secondary">
              Next day →
            </Button>
          </Link>
        )}
        {isManager && (
          <form action={generateReport} className="ml-auto flex gap-2">
            <input type="hidden" name="date" value={date} />
            <SubmitButton size="sm" variant="secondary" pendingText="Building…">
              {report ? "Rebuild" : "Build report"}
            </SubmitButton>
            {!report?.emailed_at && (
              <SubmitButton size="sm" name="email" value="1" pendingText="Building…">
                Build and email managers
              </SubmitButton>
            )}
          </form>
        )}
      </div>

      {!report || !m ? (
        <EmptyState>
          No report for {formatDate(date)} yet.{" "}
          {isManager ? "Press Build report to make one now." : "It is built every morning for the day before."}
        </EmptyState>
      ) : (
        <>
          <Card glow>
            <CardHeader>
              <CardTitle>Summary · {formatDate(date)}</CardTitle>
              <span className="text-xs text-ink-faint">
                {report.emailed_at ? `emailed ${relativeTime(report.emailed_at)}` : "not emailed"}
              </span>
            </CardHeader>
            <CardBody>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{report.summary}</p>
            </CardBody>
          </Card>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Leads</CardTitle>
              </CardHeader>
              <CardBody className="divide-y divide-line">
                <Stat label="New leads" value={m.leads.received} />
                <Stat label="By service" value={pairs(m.leads.by_service)} />
                <Stat label="By source" value={pairs(m.leads.by_source)} />
                <Stat label="By setter" value={pairs(m.leads.by_setter)} />
                <Stat label="Status updates / won" value={`${m.leads.status_changes} / ${m.leads.won}`} />
                <Stat label="Open now · not touched · unassigned" value={`${m.leads.open_total} · ${m.leads.open_untouched} · ${m.leads.open_unassigned}`} hot={m.leads.open_unassigned > 0} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Payments</CardTitle>
              </CardHeader>
              <CardBody className="divide-y divide-line">
                <Stat label="Outstanding" value={money(m.payments.outstanding)} />
                <Stat label="Overdue" value={`${m.payments.overdue_count} · ${money(m.payments.overdue)}`} hot={m.payments.overdue_count > 0} />
                <Stat label="Paid that day" value={m.payments.paid_today} />
                <Stat label="Reminders sent / waiting" value={`${m.payments.reminders_sent} / ${m.payments.reminders_waiting}`} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Clients &amp; concerns</CardTitle>
              </CardHeader>
              <CardBody className="divide-y divide-line">
                <Stat label="New clients" value={m.clients.new} />
                <Stat label="Onboarding · live" value={`${m.clients.onboarding} · ${m.clients.live}`} />
                <Stat label="Stage moves" value={m.clients.stage_moves} />
                <Stat label="Concerns opened / resolved" value={`${m.concerns.opened} / ${m.concerns.resolved}`} />
                <Stat label="Open concerns (high/urgent)" value={`${m.concerns.open_total} (${m.concerns.urgent_open})`} hot={m.concerns.urgent_open > 0} />
                <Stat label="Tasks done · overdue" value={`${m.tasks.completed} · ${m.tasks.overdue}`} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Check-ins &amp; candidates</CardTitle>
              </CardHeader>
              <CardBody className="divide-y divide-line">
                <Stat label="Check-ins sent / replies" value={`${m.checkins.sent} / ${m.checkins.replies}`} />
                <Stat label="At risk" value={m.checkins.at_risk_open} hot={m.checkins.at_risk_open > 0} />
                <Stat label="Waiting to send" value={m.checkins.waiting_to_send} />
                <Stat label="New candidates" value={m.candidates.received} />
                <Stat label="Shortlisted (total)" value={m.candidates.shortlisted_total} />
                {m.candidates.top.map((c) => (
                  <Stat key={c.name} label={c.name} value={`${c.role ?? "—"}${c.score != null ? ` · ${c.score}` : ""}`} />
                ))}
              </CardBody>
            </Card>
          </div>
        </>
      )}

      {(recent ?? []).length > 0 && (
        <p className="flex flex-wrap gap-2 text-xs text-ink-faint">
          Recent:
          {(recent ?? []).map((r) => (
            <Link key={r.report_date as string} href={`/reports/daily?date=${r.report_date}`} className="text-brand-600 hover:underline">
              {formatDate(r.report_date as string)}
            </Link>
          ))}
        </p>
      )}
    </div>
  );
}
