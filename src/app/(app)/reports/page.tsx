import { getServerSupabase } from "@/lib/supabase/server";
import { getProfiles, getStages, profileMap } from "@/lib/data/queries";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/primitives";
import { daysSince } from "@/lib/utils";
import type { Client } from "@/lib/types";

export const metadata = { title: "Reports · OSF AI Team Dashboard" };

export default async function ReportsPage() {
  const supabase = await getServerSupabase();
  const [{ data: clientRows }, stages, profiles] = await Promise.all([
    supabase.from("clients").select("*").eq("pipeline", "ai"),
    getStages("ai"),
    getProfiles(),
  ]);
  const clients = (clientRows as Client[]) ?? [];
  const pm = profileMap(profiles);

  const active = clients.filter((c) => !["withdrawn", "rejected", "churned"].includes(c.status));

  // Clients + avg age per stage
  const perStage = stages.map((s) => {
    const inStage = active.filter((c) => c.stage_id === s.id);
    const ages = inStage.map((c) => daysSince(c.stage_entered_at) ?? 0);
    const avg = ages.length ? Math.round(ages.reduce((a, b) => a + b, 0) / ages.length) : 0;
    const overSla =
      s.sla_days != null ? inStage.filter((c) => (daysSince(c.stage_entered_at) ?? 0) > s.sla_days!).length : 0;
    return { stage: s, count: inStage.length, avg, overSla };
  });
  const bottleneck = [...perStage]
    .filter((r) => !r.stage.is_terminal && r.stage.sla_days != null)
    .sort((a, b) => b.avg - a.avg)[0];

  // Go-lives per month
  const goLiveByMonth = new Map<string, number>();
  for (const c of clients) {
    if (!c.start_date) continue;
    const m = c.start_date.slice(0, 7);
    goLiveByMonth.set(m, (goLiveByMonth.get(m) ?? 0) + 1);
  }
  const months = [...goLiveByMonth.entries()].sort().slice(-6);

  // Per manager
  const perManager = new Map<string, number>();
  for (const c of active) {
    const key = c.manager_id ?? "unassigned";
    perManager.set(key, (perManager.get(key) ?? 0) + 1);
  }

  const setupTotal = clients.reduce((a, c) => a + (c.setup_fee ?? 0), 0);
  const feePaid = clients.filter((c) => c.hiring_fee_status === "paid").length;
  const feePending = clients.filter((c) => c.hiring_fee_status === "pending").length;
  const withdrawn = clients.filter((c) => c.status === "withdrawn").length;
  const rejected = clients.filter((c) => c.status === "rejected").length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Reports" subtitle="AI receptionist onboarding" />

      <div className="grid gap-4 sm:grid-cols-4">
        <Kpi label="Active clients" value={active.length} />
        <Kpi label="Bottleneck stage" value={bottleneck?.stage.name ?? "—"} sub={bottleneck ? `${bottleneck.avg}d avg` : ""} />
        <Kpi label="Hiring fee paid" value={feePaid} sub={`${feePending} pending`} />
        <Kpi label="Setup fees booked" value={`£${setupTotal.toLocaleString()}`} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pipeline by stage</CardTitle>
        </CardHeader>
        <CardBody className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-faint">
                <th className="pb-2 font-medium">Stage</th>
                <th className="pb-2 font-medium">Clients</th>
                <th className="pb-2 font-medium">Avg days in stage</th>
                <th className="pb-2 font-medium">Past SLA</th>
              </tr>
            </thead>
            <tbody>
              {perStage.map((r) => (
                <tr key={r.stage.id} className="border-t border-line">
                  <td className="py-2 text-ink-muted">{r.stage.name}</td>
                  <td className="py-2">
                    <span className="inline-block h-2 rounded bg-slate-200 align-middle" style={{ width: `${Math.max(r.count * 14, r.count ? 8 : 0)}px` }} />
                    <span className="ml-2">{r.count}</span>
                  </td>
                  <td className="py-2 text-ink-muted">{r.avg}d</td>
                  <td className={`py-2 ${r.overSla ? "text-red-600" : "text-ink-faint"}`}>{r.overSla}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardBody>
      </Card>

      <div className="grid gap-6 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Go-lives per month</CardTitle>
          </CardHeader>
          <CardBody>
            {months.length === 0 ? (
              <p className="text-sm text-ink-faint">No start dates recorded.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {months.map(([m, n]) => (
                  <li key={m} className="flex items-center gap-2">
                    <span className="w-16 text-ink-muted">{m}</span>
                    <span className="inline-block h-3 rounded bg-emerald-400" style={{ width: `${n * 18}px` }} />
                    <span>{n}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Load per manager</CardTitle>
          </CardHeader>
          <CardBody>
            <ul className="space-y-1 text-sm">
              {[...perManager.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([id, n]) => (
                  <li key={id} className="flex items-center gap-2">
                    <span className="w-28 truncate text-ink-muted">
                      {id === "unassigned" ? "Unassigned" : pm.get(id)?.full_name ?? "—"}
                    </span>
                    <span className="inline-block h-3 rounded bg-brand-400" style={{ width: `${n * 18}px` }} />
                    <span>{n}</span>
                  </li>
                ))}
            </ul>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lost deals</CardTitle>
        </CardHeader>
        <CardBody>
          <p className="text-sm text-ink-muted">
            {withdrawn} withdrawn · {rejected} rejected
          </p>
        </CardBody>
      </Card>
    </div>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card className="px-4 py-3">
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="mt-1 text-xl font-semibold text-ink">{value}</p>
      {sub && <p className="text-xs text-ink-faint">{sub}</p>}
    </Card>
  );
}
