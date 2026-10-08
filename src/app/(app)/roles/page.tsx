import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, UsersRound } from "lucide-react";
import { getMyAreas, requireProfile } from "@/lib/auth";
import { homeFor } from "@/lib/areas";
import { getServerSupabase } from "@/lib/supabase/server";
import { getProfiles } from "@/lib/data/queries";
import { clientNames } from "@/lib/server/staffing";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select, Textarea } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { Flash, flashFrom } from "@/components/ops/flash";
import { EMPLOYMENT_TYPE, ROLE_PRIORITY, ROLE_STAGE, ROLE_STATUS } from "@/lib/labels";
import { VA_ROLES, dublinDate } from "@/lib/ops-core";
import { cn, formatDate, relativeTime } from "@/lib/utils";
import type { RoleCandidateStage, VaRole } from "@/lib/types";
import { createRole } from "./actions";
import { allRows } from "@/lib/server/paged";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { Tabs } from "@/components/motion/tabs";

export const metadata = { title: "Open roles · OSF AI Team Dashboard" };

const VIEWS = {
  active: { label: "Active", statuses: ["open", "sourcing", "interviewing", "offer"] },
  filled: { label: "Filled", statuses: ["filled"] },
  paused: { label: "On hold / cancelled", statuses: ["on_hold", "cancelled"] },
  all: { label: "All", statuses: null },
} as const;

const PRIORITY_RANK = { urgent: 0, high: 1, normal: 2, low: 3 } as const;

export default async function RolesPage(props: PageProps<"/roles">) {
  await requireProfile();
  const areas = await getMyAreas();
  if (!areas.includes("candidates") && !areas.includes("clients")) redirect(homeFor(areas));
  const canEdit = areas.includes("candidates");
  const sp = await props.searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const view = (one("view") in VIEWS ? one("view") : "active") as keyof typeof VIEWS;
  const msg = flashFrom(sp);

  const supabase = await getServerSupabase();
  let q = supabase.from("va_roles").select("*").order("created_at", { ascending: false }).limit(500);
  const st = VIEWS[view].statuses;
  if (st) q = q.in("status", [...st]);
  const [{ data }, allRoles, profiles] = await Promise.all([
    q,
    allRows((a, b) => supabase.from("va_roles").select("status, headcount, updated_at").order("id").range(a, b)),
    getProfiles(),
  ]);
  const roles = ((data as VaRole[]) ?? []).sort(
    (a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (a.start_by ?? "9999").localeCompare(b.start_by ?? "9999"),
  );
  const ids = roles.map((r) => r.id);
  const [{ data: rcs }, names] = await Promise.all([
    ids.length && canEdit
      ? supabase.from("va_role_candidates").select("role_id, stage").in("role_id", ids)
      : Promise.resolve({ data: [] as { role_id: string; stage: RoleCandidateStage }[] }),
    clientNames(canEdit ? undefined : roles.map((r) => r.client_id)),
  ]);
  const pipe = new Map<string, Record<string, number>>();
  for (const rc of rcs ?? []) {
    const m = pipe.get(rc.role_id) ?? {};
    m[rc.stage] = (m[rc.stage] ?? 0) + 1;
    pipe.set(rc.role_id, m);
  }
  const people = new Map(profiles.map((p) => [p.id, p.full_name || p.email]));
  const today = dublinDate();
  const monthStart = today.slice(0, 8) + "01";
  const all = allRoles ?? [];
  const active = all.filter((r) => ["open", "sourcing", "interviewing", "offer"].includes(r.status));

  return (
    <div className="space-y-5">
      <PageHeader title="Open roles" subtitle="What clients have asked us to hire for, and who we're putting forward" />
      <Flash msg={msg} />

      <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
        {[
          { n: active.length, l: "Active roles" },
          { n: active.reduce((s, r) => s + (r.headcount ?? 1), 0), l: "Seats to fill" },
          { n: all.filter((r) => r.status === "interviewing" || r.status === "offer").length, l: "Interviewing / offer" },
          { n: all.filter((r) => r.status === "filled" && r.updated_at >= monthStart).length, l: "Filled this month" },
        ].map((t) => (
          <div key={t.l} className="glass rounded-2xl px-3 py-3">
            <p className="text-2xl font-semibold text-ink"><AnimatedNumber value={t.n} /></p>
            <p className="text-xs text-ink-faint">{t.l}</p>
          </div>
        ))}
      </div>

      {canEdit && (
        <details className="glass rounded-2xl">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-ink">+ Open a new role</summary>
          <form action={createRole} className="grid grid-cols-1 gap-3 px-4 pb-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="sm:col-span-2">
              <Label>Client *</Label>
              <Select name="client_id" required defaultValue="">
                <option value="" disabled>Choose a client…</option>
                {[...names].map(([id, n]) => (
                  <option key={id} value={id}>{n}</option>
                ))}
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Role *</Label>
              <Input name="title" required maxLength={120} list="va-roles" placeholder="e.g. Executive Assistant" />
              <datalist id="va-roles">
                {VA_ROLES.map((r) => <option key={r} value={r} />)}
              </datalist>
            </div>
            <div>
              <Label>How many</Label>
              <Input name="headcount" type="number" min={1} max={50} defaultValue={1} />
            </div>
            <div>
              <Label>Type</Label>
              <Select name="employment_type" defaultValue="full_time">
                {Object.entries(EMPLOYMENT_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
            <div>
              <Label>Hours / week</Label>
              <Input name="hours_per_week" type="number" min={1} max={80} placeholder="40" />
            </div>
            <div>
              <Label>Budget</Label>
              <Input name="budget" maxLength={80} placeholder="e.g. $6–8/h" />
            </div>
            <div>
              <Label>Start by</Label>
              <Input name="start_by" type="date" />
            </div>
            <div>
              <Label>Priority</Label>
              <Select name="priority" defaultValue="normal">
                {Object.entries(ROLE_PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </Select>
            </div>
            <div className="sm:col-span-2">
              <Label>Recruiter</Label>
              <Select name="owner_id" defaultValue="">
                <option value="">Me</option>
                {profiles.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
              </Select>
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <Label>Requirements</Label>
              <Textarea name="requirements" maxLength={4000} placeholder="Skills, tools, time zone, must-haves…" />
            </div>
            <div className="sm:col-span-2 lg:col-span-4">
              <SubmitButton pendingText="Opening…">Open role</SubmitButton>
            </div>
          </form>
        </details>
      )}

      <Tabs
        variant="pill"
        active={view}
        items={Object.entries(VIEWS).map(([k, v]) => ({ key: k, href: k === "active" ? "/roles" : `/roles?view=${k}`, label: v.label }))}
      />

      {roles.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong px-4 py-12 text-center text-sm text-ink-faint">
          No roles here yet.{canEdit ? " Open one above when a client asks for a VA." : ""}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {roles.map((r) => {
            const p = pipe.get(r.id) ?? {};
            const hired = p.hired ?? 0;
            const late = r.start_by && r.start_by < today && !["filled", "cancelled"].includes(r.status);
            return (
              <Link key={r.id} href={`/roles/${r.id}`} className="glass group rounded-2xl p-4 transition-all hover:-translate-y-0.5 hover:border-line-strong">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink group-hover:text-brand-600">{r.title}</p>
                    <p className="truncate text-sm text-ink-muted">{names.get(r.client_id) ?? "Client"}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <Badge tone={ROLE_STATUS[r.status].tone}>{ROLE_STATUS[r.status].label}</Badge>
                    {r.priority !== "normal" && <Badge tone={ROLE_PRIORITY[r.priority].tone}>{ROLE_PRIORITY[r.priority].label}</Badge>}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
                  <span className="inline-flex items-center gap-1"><UsersRound className="h-3.5 w-3.5" /> {hired}/{r.headcount} hired</span>
                  <span>{EMPLOYMENT_TYPE[r.employment_type]}{r.hours_per_week ? ` · ${r.hours_per_week}h/wk` : ""}</span>
                  {r.start_by && (
                    <span className={cn("inline-flex items-center gap-1", late && "font-medium text-rose-500")}>
                      <CalendarClock className="h-3.5 w-3.5" /> start by {formatDate(r.start_by)}
                    </span>
                  )}
                  {r.owner_id && <span>· {people.get(r.owner_id)}</span>}
                </div>
                {canEdit && (
                  <div className="mt-3 flex h-1.5 overflow-hidden rounded-full bg-fill">
                    <div className="bar-grow flex h-full w-full">
                    {(["shortlisted", "interview", "offered", "hired"] as const).map((k) =>
                      p[k] ? (
                        <span
                          key={k}
                          title={`${ROLE_STAGE[k].label}: ${p[k]}`}
                          className={cn("h-full", { shortlisted: "bg-brand-400", interview: "bg-violet-400", offered: "bg-accent-400", hired: "bg-emerald-400" }[k])}
                          style={{ width: `${(p[k] / Math.max(1, Object.values(p).reduce((a, b) => a + b, 0))) * 100}%` }}
                        />
                      ) : null,
                    )}
                    </div>
                  </div>
                )}
                {canEdit && (
                  <p className="mt-1.5 text-[11px] text-ink-faint">
                    {Object.keys(p).length
                      ? (["shortlisted", "interview", "offered"] as const).filter((k) => p[k]).map((k) => `${p[k]} ${ROLE_STAGE[k].label.toLowerCase()}`).join(" · ") || "No one in play"
                      : "No candidates yet"}
                    {" · "}opened {relativeTime(r.created_at)}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
