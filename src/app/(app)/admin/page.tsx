import { requireRole } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { getStages } from "@/lib/data/queries";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardBody, Input } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { relativeTime } from "@/lib/utils";
import { inviteMember, updateStage, addOption, removeOption } from "./actions";
import { RoleSelect, ActiveToggle } from "./member-controls";
import type { OptionRow, Profile } from "@/lib/types";

export const metadata = { title: "Admin · OSF AI Team Dashboard" };

export default async function AdminPage() {
  const me = await requireRole("manager");
  const isAdmin = me.role === "admin";
  const supabase = await getServerSupabase();

  const [{ data: members }, stages, { data: options }, { data: activity }] = await Promise.all([
    supabase.from("profiles").select("*").order("created_at"),
    getStages(),
    supabase.from("option_lists").select("*").eq("active", true).order("kind").order("position"),
    supabase.from("activity_log").select("*").order("created_at", { ascending: false }).limit(40),
  ]);

  const optionsByKind = new Map<string, OptionRow[]>();
  for (const o of (options as OptionRow[]) ?? []) {
    const arr = optionsByKind.get(o.kind) ?? [];
    arr.push(o);
    optionsByKind.set(o.kind, arr);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Admin" subtitle="Team, pipeline configuration, audit log" />

      <Card>
        <CardHeader>
          <CardTitle>Team members</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          {isAdmin && (
            <form action={inviteMember} className="flex flex-wrap items-end gap-2">
              <div>
                <label className="text-xs text-ink-muted">Full name</label>
                <Input name="full_name" className="w-40" />
              </div>
              <div>
                <label className="text-xs text-ink-muted">Email</label>
                <Input name="email" type="email" className="w-56" required />
              </div>
              <Button size="sm" type="submit">
                Send invite
              </Button>
            </form>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-faint">
                <th className="pb-2 font-medium">Name</th>
                <th className="pb-2 font-medium">Email</th>
                <th className="pb-2 font-medium">Role</th>
                <th className="pb-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {((members as Profile[]) ?? []).map((m) => (
                <tr key={m.id} className="border-t border-line">
                  <td className="py-2">{m.full_name || "—"}</td>
                  <td className="py-2 text-ink-muted">{m.email}</td>
                  <td className="py-2">
                    {isAdmin ? (
                      <RoleSelect id={m.id} role={m.role} />
                    ) : (
                      <span className="capitalize">{m.role}</span>
                    )}
                  </td>
                  <td className="py-2">
                    <div className="flex items-center gap-2">
                      <Badge tone={m.active ? "green" : "neutral"}>
                        {m.active ? "Active" : "Inactive"}
                      </Badge>
                      {isAdmin && m.id !== me.id && <ActiveToggle id={m.id} active={m.active} />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-xs text-ink-faint">
            Invites use Supabase Auth. New members land as “member” — set their role above.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pipeline stages &amp; SLAs</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          {(["ai", "va"] as const).map((pipe) => (
            <div key={pipe}>
              <p className="mb-1 text-xs font-medium uppercase text-ink-faint">{pipe}</p>
              <div className="space-y-1">
                {stages
                  .filter((s) => s.pipeline === pipe)
                  .map((s) => (
                    <form
                      key={s.id}
                      action={updateStage}
                      className="flex items-center gap-2 text-sm"
                    >
                      <input type="hidden" name="id" value={s.id} />
                      <span className="w-6 text-xs text-ink-faint">{s.position}</span>
                      <Input name="name" defaultValue={s.name} className="h-8 w-48" disabled={!isAdmin} />
                      <Input
                        name="sla_days"
                        type="number"
                        defaultValue={s.sla_days ?? ""}
                        placeholder="SLA days"
                        className="h-8 w-24"
                        disabled={!isAdmin}
                      />
                      {isAdmin && (
                        <Button size="sm" variant="ghost" type="submit">
                          Save
                        </Button>
                      )}
                    </form>
                  ))}
              </div>
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Dropdown options</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          {["source", "booking_system", "country", "concern_type"].map((kind) => (
            <div key={kind}>
              <p className="mb-1 text-xs font-medium text-ink-muted">{kind}</p>
              <ul className="space-y-1">
                {(optionsByKind.get(kind) ?? []).map((o) => (
                  <li key={o.id} className="flex items-center justify-between text-sm">
                    <span>{o.value}</span>
                    {isAdmin && (
                      <form action={removeOption} className="inline">
                        <input type="hidden" name="id" value={o.id} />
                        <button className="text-xs text-ink-faint hover:text-red-400">remove</button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
              {isAdmin && (
                <form action={addOption} className="mt-1 flex gap-1">
                  <input type="hidden" name="kind" value={kind} />
                  <Input name="value" placeholder="Add…" className="h-7 text-xs" />
                  <Button size="sm" variant="ghost" type="submit">
                    +
                  </Button>
                </form>
              )}
            </div>
          ))}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent activity (audit log)</CardTitle>
        </CardHeader>
        <CardBody>
          <ul className="space-y-1.5 text-sm">
            {((activity as { id: string; summary: string; verb: string; created_at: string }[]) ?? []).map(
              (a) => (
                <li key={a.id} className="flex justify-between text-ink-muted">
                  <span>{a.summary}</span>
                  <span className="text-xs text-ink-faint">{relativeTime(a.created_at)}</span>
                </li>
              ),
            )}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
