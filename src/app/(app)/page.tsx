import * as React from "react";
import Link from "next/link";
import { requireProfile } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { getStages } from "@/lib/data/queries";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardBody, EmptyState } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badge";
import { CLIENT_STATUS } from "@/lib/labels";
import { daysSince, formatDate } from "@/lib/utils";
import { TaskCheckbox } from "@/app/(app)/_components/task-checkbox";
import type { Client, Concern, PipelineStage, Task } from "@/lib/types";

export const metadata = { title: "My Desk · AI Receptionist Ops" };

export default async function MyDeskPage() {
  const profile = await requireProfile();
  const supabase = await getServerSupabase();

  const [{ data: myClients }, { data: myTasks }, stages] = await Promise.all([
    supabase.from("clients").select("*").eq("manager_id", profile.id).order("stage_entered_at"),
    supabase
      .from("tasks")
      .select("*")
      .eq("assignee_id", profile.id)
      .eq("status", "open")
      .order("due_date", { ascending: true, nullsFirst: false }),
    getStages(),
  ]);

  const clients = (myClients as Client[]) ?? [];
  const tasks = (myTasks as Task[]) ?? [];
  const stageById = new Map<string, PipelineStage>(stages.map((s) => [s.id, s]));

  const clientIds = clients.map((c) => c.id);
  const { data: concernRows } = clientIds.length
    ? await supabase
        .from("concerns")
        .select("*")
        .in("client_id", clientIds)
        .neq("status", "resolved")
        .order("severity", { ascending: false })
    : { data: [] as Concern[] };
  const concerns = (concernRows as Concern[]) ?? [];
  const clientName = new Map(clients.map((c) => [c.id, c.name]));

  const overSla = clients.filter((c) => {
    const st = c.stage_id ? stageById.get(c.stage_id) : null;
    if (!st?.sla_days) return false;
    const d = daysSince(c.stage_entered_at);
    return d != null && d > st.sla_days;
  });

  const goLives = clients.filter((c) => {
    if (!c.start_date) return false;
    const d = daysSince(c.start_date);
    return d != null && d <= 0 && d > -8;
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={`Hi ${profile.full_name?.split(" ")[0] || "there"}`}
        subtitle="Your clients, tasks and anything that needs attention"
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Clients you manage" value={clients.length} href="/clients" />
        <Stat label="Open tasks" value={tasks.length} tone={tasks.length ? "amber" : "neutral"} />
        <Stat
          label="Past SLA"
          value={overSla.length}
          tone={overSla.length ? "red" : "neutral"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>My tasks</CardTitle>
          </CardHeader>
          <CardBody className="p-0">
            {tasks.length === 0 ? (
              <div className="px-4 py-6">
                <EmptyState>No open tasks assigned to you.</EmptyState>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {tasks.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 px-4 py-2.5">
                    <TaskCheckbox id={t.id} status={t.status} clientId={t.client_id} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-900">{t.title}</p>
                      {t.client_id && (
                        <Link
                          href={`/clients/${t.client_id}`}
                          className="text-xs text-slate-400 hover:text-slate-700"
                        >
                          {clientName.get(t.client_id) ?? "client"}
                        </Link>
                      )}
                    </div>
                    {t.due_date && (
                      <span className="text-xs text-slate-400">{formatDate(t.due_date)}</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Needs attention</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <Section title="Past SLA in current stage" empty="Nothing overdue.">
              {overSla.map((c) => {
                const st = c.stage_id ? stageById.get(c.stage_id) : null;
                return (
                  <Row key={c.id} href={`/clients/${c.id}`} name={c.name}>
                    <span className="text-xs text-red-600">
                      {daysSince(c.stage_entered_at)}d in {st?.name}
                    </span>
                  </Row>
                );
              })}
            </Section>
            <Section title="Open concerns" empty="No open concerns.">
              {concerns.map((c) => (
                <Row key={c.id} href={`/concerns/${c.id}`} name={clientName.get(c.client_id) ?? "client"}>
                  <span className="text-xs text-slate-500">{c.title}</span>
                </Row>
              ))}
            </Section>
            <Section title="Go-live this week" empty="No go-lives scheduled.">
              {goLives.map((c) => (
                <Row key={c.id} href={`/clients/${c.id}`} name={c.name}>
                  <span className="text-xs text-slate-500">{formatDate(c.start_date)}</span>
                </Row>
              ))}
            </Section>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Clients you manage</CardTitle>
        </CardHeader>
        <CardBody className="p-0">
          {clients.length === 0 ? (
            <div className="px-4 py-6">
              <EmptyState>No clients assigned to you yet.</EmptyState>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-400">
                  <th className="px-4 py-2 font-medium">Client</th>
                  <th className="px-4 py-2 font-medium">Stage</th>
                  <th className="px-4 py-2 font-medium">In stage</th>
                  <th className="px-4 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => {
                  const st = c.stage_id ? stageById.get(c.stage_id) : null;
                  const meta = CLIENT_STATUS[c.status];
                  return (
                    <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50">
                      <td className="px-4 py-2">
                        <Link href={`/clients/${c.id}`} className="font-medium text-slate-900 hover:underline">
                          {c.name}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-slate-600">{st?.name ?? "—"}</td>
                      <td className="px-4 py-2 text-slate-500">
                        {daysSince(c.stage_entered_at)}d
                      </td>
                      <td className="px-4 py-2">
                        <Badge tone={meta.tone}>{meta.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  href,
  tone = "neutral",
}: {
  label: string;
  value: number;
  href?: string;
  tone?: "neutral" | "amber" | "red";
}) {
  const toneClass =
    tone === "red" ? "text-red-600" : tone === "amber" ? "text-amber-600" : "text-slate-900";
  const inner = (
    <Card className="px-4 py-3">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${toneClass}`}>{value}</p>
    </Card>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
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
      <p className="mb-1 text-xs font-medium text-slate-400">{title}</p>
      {count > 0 ? (
        <div className="space-y-1">{children}</div>
      ) : (
        <p className="text-sm text-slate-400">{empty}</p>
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
    <Link href={href} className="flex items-center justify-between rounded px-2 py-1 hover:bg-slate-50">
      <span className="text-sm font-medium text-slate-800">{name}</span>
      {children}
    </Link>
  );
}
