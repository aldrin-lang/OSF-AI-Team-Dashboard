import { requireRole } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { getStages } from "@/lib/data/queries";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardBody, Input, Select, Textarea, Label } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { relativeTime } from "@/lib/utils";
import { TEMPLATE_VARS } from "@/lib/email-render";
import { Flash, flashFrom } from "@/components/ops/flash";
import { SubmitButton } from "@/components/ui/submit-button";
import { AREAS, AREA_INFO } from "@/lib/areas";
import {
  inviteMember,
  setMemberDepartments,
  setDepartmentAreas,
  updateStage,
  addOption,
  removeOption,
  saveEmailTemplate,
  deleteEmailTemplate,
} from "./actions";
import { RoleSelect, ActiveToggle } from "./member-controls";
import type { EmailTemplate, OptionRow, Profile } from "@/lib/types";

export const metadata = { title: "Admin · OSF AI Team Dashboard" };

export default async function AdminPage(props: PageProps<"/admin">) {
  const me = await requireRole("manager");
  const msg = flashFrom(await props.searchParams);
  const isAdmin = me.role === "admin";
  const supabase = await getServerSupabase();

  const [
    { data: members },
    stages,
    { data: options },
    { data: activity },
    { data: templates },
    { data: deptRows },
    { data: deptAreaRows },
    { data: memberDeptRows },
  ] = await Promise.all([
      supabase.from("profiles").select("*").order("created_at"),
      getStages(),
      supabase.from("option_lists").select("*").eq("active", true).order("kind").order("position"),
      supabase.from("activity_log").select("*").order("created_at", { ascending: false }).limit(40),
      supabase.from("email_templates").select("*").order("name"),
      supabase.from("departments").select("key, name").order("position"),
      supabase.from("department_areas").select("department, area"),
      supabase.from("profile_departments").select("profile_id, department"),
    ]);
  const departments = (deptRows as { key: string; name: string }[]) ?? [];
  const deptName = new Map(departments.map((d) => [d.key, d.name]));
  const areasOf = (dept: string) => (deptAreaRows ?? []).filter((r) => r.department === dept).map((r) => r.area as string);
  const deptsOf = (id: string) =>
    (memberDeptRows ?? []).filter((r) => r.profile_id === id).map((r) => r.department as string);
  const emailTemplates = (templates as EmailTemplate[]) ?? [];
  const aiStages = stages.filter((s) => s.pipeline === "ai");

  const optionsByKind = new Map<string, OptionRow[]>();
  for (const o of (options as OptionRow[]) ?? []) {
    const arr = optionsByKind.get(o.kind) ?? [];
    arr.push(o);
    optionsByKind.set(o.kind, arr);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Admin" subtitle="Team, departments, pipeline configuration, audit log" />
      <Flash msg={msg} />

      <Card>
        <CardHeader>
          <CardTitle>Team members</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          {isAdmin && (
            <form action={inviteMember} className="space-y-3 rounded-xl border border-line p-3">
              <p className="text-sm font-medium text-ink">Give someone access</p>
              <div className="flex flex-wrap items-end gap-2">
                <div>
                  <label className="text-xs text-ink-muted">Full name</label>
                  <Input name="full_name" className="w-44" />
                </div>
                <div>
                  <label className="text-xs text-ink-muted">Email</label>
                  <Input name="email" type="email" className="w-60" required />
                </div>
                <div>
                  <label className="text-xs text-ink-muted">Role</label>
                  <Select name="role" defaultValue="member" className="w-44">
                    <option value="member">Member</option>
                    <option value="manager">Manager (dept head)</option>
                    <option value="admin">Admin (sees everything)</option>
                  </Select>
                </div>
              </div>
              <div>
                <p className="mb-1 text-xs text-ink-muted">Departments (what they can see)</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                  {departments.map((d) => (
                    <label key={d.key} className="flex items-center gap-1.5 text-sm text-ink">
                      <input type="checkbox" name="departments" value={d.key} className="accent-brand-500" />
                      {d.name}
                    </label>
                  ))}
                </div>
              </div>
              <SubmitButton size="sm" pendingText="Sending invite…">
                Send invite
              </SubmitButton>
              <p className="text-xs text-ink-faint">
                They get an email, set their own password, and only see their departments&apos; tabs.
              </p>
            </form>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-faint">
                <th className="pb-2 font-medium">Name</th>
                <th className="pb-2 font-medium">Email</th>
                <th className="pb-2 font-medium">Role</th>
                <th className="pb-2 font-medium">Departments</th>
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
                    {m.role === "admin" ? (
                      <span className="text-xs text-ink-faint">Everything</span>
                    ) : isAdmin ? (
                      <details>
                        <summary className="cursor-pointer text-xs text-brand-600">
                          {deptsOf(m.id).map((d) => deptName.get(d) ?? d).join(", ") || "None: no access"}
                        </summary>
                        <form action={setMemberDepartments} className="mt-2 space-y-1">
                          <input type="hidden" name="id" value={m.id} />
                          {departments.map((d) => (
                            <label key={d.key} className="flex items-center gap-1.5 text-xs text-ink">
                              <input
                                type="checkbox"
                                name="departments"
                                value={d.key}
                                defaultChecked={deptsOf(m.id).includes(d.key)}
                                className="accent-brand-500"
                              />
                              {d.name}
                            </label>
                          ))}
                          <SubmitButton size="sm" variant="secondary" pendingText="Saving…">
                            Save
                          </SubmitButton>
                        </form>
                      </details>
                    ) : (
                      <span className="text-xs text-ink-muted">
                        {deptsOf(m.id).map((d) => deptName.get(d) ?? d).join(", ") || "—"}
                      </span>
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
            Admins see everything. Managers are department heads (e.g. can mark invoices paid in Accounts). Members
            work in their departments.
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Departments: who sees what</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3">
          <p className="text-xs text-ink-faint">
            Tick the tabs each department can open. Takes effect on their next page load. Admins always see everything.
          </p>
          <div className="space-y-2">
            {departments.map((d) => (
              <form key={d.key} action={setDepartmentAreas} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-line px-3 py-2">
                <input type="hidden" name="department" value={d.key} />
                <span className="w-32 text-sm font-medium text-ink">{d.name}</span>
                {AREAS.map((a) => (
                  <label key={a} className="flex items-center gap-1.5 text-sm text-ink-muted" title={AREA_INFO[a].tabs}>
                    <input
                      type="checkbox"
                      name="areas"
                      value={a}
                      defaultChecked={areasOf(d.key).includes(a)}
                      disabled={!isAdmin}
                      className="accent-brand-500"
                    />
                    {AREA_INFO[a].label}
                  </label>
                ))}
                {isAdmin && (
                  <SubmitButton size="sm" variant="ghost" pendingText="Saving…" className="ml-auto">
                    Save
                  </SubmitButton>
                )}
              </form>
            ))}
          </div>
          <p className="text-xs text-ink-faint">Clients includes Pipeline and Concerns. Reports includes the Daily report.</p>
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
                        <button className="text-xs text-ink-faint hover:text-red-600">remove</button>
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
          <CardTitle>Email templates &amp; automation</CardTitle>
        </CardHeader>
        <CardBody className="space-y-5">
          <p className="text-xs text-ink-faint">
            Variables:{" "}
            {TEMPLATE_VARS.map((v) => (
              <code key={v.key} className="mx-0.5 rounded bg-fill-strong px-1 text-[11px] text-brand-600">
                {`{{${v.key}}}`}
              </code>
            ))}
          </p>

          {emailTemplates.map((t) => (
            <details key={t.id} className="rounded-xl border border-line bg-fill p-3">
              <summary className="flex cursor-pointer items-center gap-2 text-sm text-ink">
                <span className="font-medium">{t.name}</span>
                {t.trigger !== "manual" && (
                  <Badge tone="amber">auto: {t.trigger.replace("on_stage:", "")}</Badge>
                )}
                {!t.active && <Badge tone="neutral">off</Badge>}
              </summary>
              <form action={saveEmailTemplate} className="mt-3 space-y-2">
                <input type="hidden" name="id" value={t.id} />
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <Label>Name</Label>
                    <Input name="name" defaultValue={t.name} disabled={!isAdmin} />
                  </div>
                  <div>
                    <Label>Auto-trigger</Label>
                    <Select name="trigger" defaultValue={t.trigger} disabled={!isAdmin}>
                      <option value="manual">Manual only</option>
                      {aiStages.map((s) => (
                        <option key={s.id} value={`on_stage:${s.name}`}>
                          When entering: {s.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Subject</Label>
                  <Input name="subject" defaultValue={t.subject} disabled={!isAdmin} />
                </div>
                <div>
                  <Label>Body</Label>
                  <Textarea name="body" defaultValue={t.body} className="min-h-[180px] font-mono text-xs" disabled={!isAdmin} />
                </div>
                <label className="flex items-center gap-2 text-xs text-ink-muted">
                  <input type="checkbox" name="active" defaultChecked={t.active} disabled={!isAdmin} className="accent-brand-500" />
                  Active
                </label>
                {isAdmin && (
                  <div className="flex gap-2">
                    <Button size="sm" type="submit">Save</Button>
                    <Button size="sm" variant="ghost" type="submit" formAction={deleteEmailTemplate}>
                      Delete
                    </Button>
                  </div>
                )}
              </form>
            </details>
          ))}

          {isAdmin && (
            <details className="rounded-xl border border-dashed border-line p-3">
              <summary className="cursor-pointer text-sm font-medium text-brand-600">
                + New template
              </summary>
              <form action={saveEmailTemplate} className="mt-3 space-y-2">
                <Input name="name" placeholder="Template name" required />
                <Select name="trigger" defaultValue="manual">
                  <option value="manual">Manual only</option>
                  {aiStages.map((s) => (
                    <option key={s.id} value={`on_stage:${s.name}`}>
                      When entering: {s.name}
                    </option>
                  ))}
                </Select>
                <Input name="subject" placeholder="Subject (use {{company}} etc.)" required />
                <Textarea name="body" placeholder="Body…" className="min-h-[160px] font-mono text-xs" />
                <label className="flex items-center gap-2 text-xs text-ink-muted">
                  <input type="checkbox" name="active" defaultChecked className="accent-brand-500" /> Active
                </label>
                <Button size="sm" type="submit">Create template</Button>
              </form>
            </details>
          )}
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
