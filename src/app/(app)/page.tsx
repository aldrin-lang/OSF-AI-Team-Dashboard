import * as React from "react";
import Link from "next/link";
import { Users, ListChecks, Clock, AlertTriangle, Rocket } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { getStages, getProfiles, profileMap } from "@/lib/data/queries";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/primitives";
import { StatTile } from "@/components/ui/stat-tile";
import { Donut } from "@/components/ui/donut";
import { Badge } from "@/components/ui/badge";
import { CLIENT_STATUS } from "@/lib/labels";
import { daysSince, formatDate, relativeTime, initials } from "@/lib/utils";
import { TaskCheckbox } from "@/app/(app)/_components/task-checkbox";
import type { ActivityRow, Client, Concern, PipelineStage, Task } from "@/lib/types";

export const metadata = { title: "My Desk · OSF AI Team Dashboard" };

function monthKey(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null;
  return Math.round(((current - previous) / previous) * 100);
}

export default async function MyDeskPage() {
  const profile = await requireProfile();
  const supabase = await getServerSupabase();

  const [
    { data: allClients },
    { data: myTasks },
    { data: openConcerns },
    { data: activityRows },
    stages,
    profiles,
  ] = await Promise.all([
    supabase.from("clients").select("*").eq("pipeline", "ai"),
    supabase
      .from("tasks")
      .select("*")
      .eq("assignee_id", profile.id)
      .eq("status", "open")
      .order("due_date", { ascending: true, nullsFirst: false }),
    supabase.from("concerns").select("*").neq("status", "resolved").order("severity", { ascending: false }),
    supabase
      .from("activity_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(12),
    getStages("ai"),
    getProfiles(),
  ]);

  const clients = (allClients as Client[]) ?? [];
  const tasks = (myTasks as Task[]) ?? [];
  const concerns = (openConcerns as Concern[]) ?? [];
  const activity = (activityRows as ActivityRow[]) ?? [];
  const pm = profileMap(profiles);
  const stageById = new Map<string, PipelineStage>(stages.map((s) => [s.id, s]));
  const clientName = new Map(clients.map((c) => [c.id, c.name]));
  const mine = clients.filter((c) => c.manager_id === profile.id);

  const active = clients.filter((c) => !["withdrawn", "rejected", "churned"].includes(c.status));
  const live = clients.filter((c) => c.status === "live");

  const now = new Date();
  const thisMonth = monthKey(now);
  const lastMonth = monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
  const createdThis = clients.filter((c) => c.created_at?.slice(0, 7) === thisMonth).length;
  const createdLast = clients.filter((c) => c.created_at?.slice(0, 7) === lastMonth).length;

  const overSla = active.filter((c) => {
    const st = c.stage_id ? stageById.get(c.stage_id) : null;
    const d = daysSince(c.stage_entered_at);
    return st?.sla_days != null && d != null && d > st.sla_days;
  });

  const goLives = active.filter((c) => {
    if (!c.start_date) return false;
    const d = daysSince(c.start_date);
    return d != null && d <= 0 && d > -8;
  });

  const byStage = stages
    .filter((s) => !s.is_terminal)
    .map((s) => ({ label: s.name, value: active.filter((c) => c.stage_id === s.id).length }))
    .filter((d) => d.value > 0);

  return (
    <div className="mx-auto max-w-6xl space-y-7">
      <PageHeader
        title={`Welcome back, ${profile.full_name?.split(" ")[0] || "there"}`}
        subtitle="Team pipeline health and everything that needs your attention"
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Active clients"
          value={active.length}
          icon={Users}
          accent="brand"
          delta={pctDelta(createdThis, createdLast)}
          hint={`${createdThis} added this month`}
          href="/clients"
        />
        <StatTile label="Live" value={live.length} icon={Rocket} accent="emerald" hint="AI receptionist in production" />
        <StatTile
          label="Past SLA"
          value={overSla.length}
          icon={Clock}
          accent={overSla.length ? "orange" : "cyan"}
          hint="stuck longer than the stage target"
        />
        <StatTile
          label="Open concerns"
          value={concerns.length}
          icon={AlertTriangle}
          accent={concerns.length ? "rose" : "violet"}
          href="/concerns"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2" glow>
          <CardHeader>
            <CardTitle>Pipeline distribution</CardTitle>
            <Link href="/pipeline" className="text-xs font-medium text-brand-600 hover:text-brand-800">
              Open board →
            </Link>
          </CardHeader>
          <CardBody>
            {byStage.length === 0 ? (
              <p className="py-6 text-sm text-ink-faint">No active clients yet.</p>
            ) : (
              <Donut data={byStage} centerValue={active.length} centerLabel="active" />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <Section title="Past SLA" empty="Nothing overdue.">
              {overSla.slice(0, 5).map((c) => {
                const st = c.stage_id ? stageById.get(c.stage_id) : null;
                return (
                  <Row key={c.id} href={`/clients/${c.id}`} name={c.name}>
                    <span className="text-xs text-rose-600">
                      {daysSince(c.stage_entered_at)}d · {st?.name}
                    </span>
                  </Row>
                );
              })}
            </Section>
            <Section title="Open concerns" empty="All clear.">
              {concerns.slice(0, 5).map((c) => (
                <Row key={c.id} href={`/concerns/${c.id}`} name={clientName.get(c.client_id) ?? "client"}>
                  <span className="text-xs text-ink-muted">{c.title}</span>
                </Row>
              ))}
            </Section>
            <Section title="Go-live this week" empty="Nothing scheduled.">
              {goLives.map((c) => (
                <Row key={c.id} href={`/clients/${c.id}`} name={c.name}>
                  <span className="text-xs text-emerald-700">{formatDate(c.start_date)}</span>
                </Row>
              ))}
            </Section>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>My tasks</CardTitle>
            <span className="text-xs text-ink-faint">{tasks.length} open</span>
          </CardHeader>
          <CardBody className="p-0">
            {tasks.length === 0 ? (
              <p className="px-5 py-6 text-sm text-ink-faint">No open tasks assigned to you.</p>
            ) : (
              <ul className="divide-y divide-line">
                {tasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-5 py-3">
                    <TaskCheckbox id={t.id} status={t.status} clientId={t.client_id} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">{t.title}</p>
                      {t.client_id && (
                        <Link
                          href={`/clients/${t.client_id}`}
                          className="text-xs text-ink-faint hover:text-brand-700"
                        >
                          {clientName.get(t.client_id) ?? "client"}
                        </Link>
                      )}
                    </div>
                    {t.due_date && (
                      <span className="text-xs text-ink-faint">{formatDate(t.due_date)}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Clients you manage</CardTitle>
            <span className="text-xs text-ink-faint">{mine.length}</span>
          </CardHeader>
          <CardBody className="p-0">
            {mine.length === 0 ? (
              <p className="px-5 py-6 text-sm text-ink-faint">
                None assigned to you yet — open a client and set yourself as Manager.
              </p>
            ) : (
              <ul className="divide-y divide-line">
                {mine.map((c) => {
                  const st = c.stage_id ? stageById.get(c.stage_id) : null;
                  const meta = CLIENT_STATUS[c.status];
                  return (
                    <li key={c.id} className="flex items-center gap-3 px-5 py-3">
                      <Link
                        href={`/clients/${c.id}`}
                        className="min-w-0 flex-1 truncate text-sm font-medium text-ink hover:text-brand-700"
                      >
                        {c.name}
                      </Link>
                      <span className="text-xs text-ink-muted">{st?.name ?? "—"}</span>
                      <Badge tone={meta.tone}>{meta.label}</Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Team activity</CardTitle>
          <Link href="/notifications" className="text-xs font-medium text-brand-600 hover:text-brand-800">
            Notifications →
          </Link>
        </CardHeader>
        <CardBody className="p-0">
          {activity.length === 0 ? (
            <p className="px-5 py-6 text-sm text-ink-faint">No activity yet.</p>
          ) : (
            <ul className="divide-y divide-line">
              {activity.map((a) => (
                <li key={a.id} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-fill-strong text-[10px] font-semibold text-ink-muted">
                    {initials(a.actor_id ? pm.get(a.actor_id)?.full_name ?? "·" : "·")}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-muted">{a.summary}</span>
                  <span className="shrink-0 text-xs text-ink-faint">{relativeTime(a.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode;
}) {
  const count = React.Children.toArray(children).length;
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-faint">
        {title}
      </p>
      {count > 0 ? (
        <div className="space-y-0.5">{children}</div>
      ) : (
        <p className="text-sm text-ink-faint">{empty}</p>
      )}
    </div>
  );
}

function Row({
  href,
  name,
  children,
}: {
  href: string;
  name: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="-mx-2 flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-fill"
    >
      <span className="truncate text-sm font-medium text-ink">{name}</span>
      <span className="shrink-0">{children}</span>
    </Link>
  );
}
