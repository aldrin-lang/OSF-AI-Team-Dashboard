import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, Sparkles, UserPlus, X } from "lucide-react";
import { getMyAreas, requireProfile } from "@/lib/auth";
import { homeFor } from "@/lib/areas";
import { getServerSupabase } from "@/lib/supabase/server";
import { getProfiles } from "@/lib/data/queries";
import { clientNames, matchCandidates } from "@/lib/server/staffing";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, CardHeader, CardTitle, Input, Label, Select, Textarea } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { Flash, flashFrom } from "@/components/ops/flash";
import { ScoreBadge } from "@/components/ops/score-badge";
import { EMPLOYMENT_TYPE, ROLE_PRIORITY, ROLE_STAGE, ROLE_STATUS } from "@/lib/labels";
import { VA_ROLES } from "@/lib/ops-core";
import { cn, formatDate } from "@/lib/utils";
import type { Candidate, RoleCandidateStage, VaRole, VaRoleCandidate } from "@/lib/types";
import { addCandidateToRole, hire, moveRoleCandidate, removeFromRole, setRoleStatus, updateRole } from "../actions";

export const metadata = { title: "Role · OSF AI Team Dashboard" };

const BOARD: RoleCandidateStage[] = ["shortlisted", "interview", "offered", "hired"];
const STAGE_BAR: Record<RoleCandidateStage, string> = {
  suggested: "bg-slate-400",
  shortlisted: "bg-brand-400",
  interview: "bg-violet-400",
  offered: "bg-accent-400",
  hired: "bg-emerald-400",
  rejected: "bg-rose-400",
};

export default async function RolePage(props: PageProps<"/roles/[id]">) {
  await requireProfile();
  const areas = await getMyAreas();
  if (!areas.includes("candidates") && !areas.includes("clients")) redirect(homeFor(areas));
  const canEdit = areas.includes("candidates");
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sp = await props.searchParams;
  const msg = flashFrom(sp);

  const supabase = await getServerSupabase();
  const { data: roleRow } = await supabase.from("va_roles").select("*").eq("id", id).maybeSingle();
  if (!roleRow) notFound();
  const role = roleRow as VaRole;

  const [{ data: rcRows }, names, profiles, matches, { data: pool }] = await Promise.all([
    canEdit ? supabase.from("va_role_candidates").select("*").eq("role_id", id).order("match_score", { ascending: false }) : Promise.resolve({ data: [] }),
    clientNames([role.client_id]),
    getProfiles(),
    canEdit ? matchCandidates(role, 8) : Promise.resolve([]),
    canEdit
      ? supabase.from("candidates").select("id, full_name, ai_recommended_role").in("status", ["new", "screened", "shortlisted", "interview"]).order("full_name").limit(1000)
      : Promise.resolve({ data: [] }),
  ]);
  const rcs = (rcRows as VaRoleCandidate[]) ?? [];
  const candIds = rcs.map((r) => r.candidate_id);
  const { data: cands } = candIds.length
    ? await supabase.from("candidates").select("*").in("id", candIds)
    : { data: [] as Candidate[] };
  const cMap = new Map(((cands as Candidate[]) ?? []).map((c) => [c.id, c]));
  const onRole = new Set(candIds);
  const clientName = names.get(role.client_id) ?? "Client";
  const owner = profiles.find((p) => p.id === role.owner_id);
  const hiredCount = rcs.filter((r) => r.stage === "hired").length;
  const rejected = rcs.filter((r) => r.stage === "rejected" || r.stage === "suggested");

  return (
    <div className="space-y-5">
      <div>
        <Link href="/roles" className="inline-flex items-center gap-1 text-xs text-ink-faint hover:text-ink">
          <ChevronLeft className="h-3.5 w-3.5" /> Open roles
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold tracking-tight text-ink">{role.title}</h1>
          <Badge tone={ROLE_STATUS[role.status].tone}>{ROLE_STATUS[role.status].label}</Badge>
          {role.priority !== "normal" && <Badge tone={ROLE_PRIORITY[role.priority].tone}>{ROLE_PRIORITY[role.priority].label}</Badge>}
        </div>
        <p className="mt-1 text-sm text-ink-muted">
          {areas.includes("clients") ? (
            <Link href={`/clients/${role.client_id}`} className="font-medium text-brand-600 hover:underline dark:text-brand-300">{clientName}</Link>
          ) : (
            <span className="font-medium text-ink">{clientName}</span>
          )}
          {" · "}
          {hiredCount}/{role.headcount} hired · {EMPLOYMENT_TYPE[role.employment_type]}
          {role.hours_per_week ? ` · ${role.hours_per_week}h/wk` : ""}
          {role.budget ? ` · ${role.budget}` : ""}
          {role.start_by ? ` · start by ${formatDate(role.start_by)}` : ""}
          {owner ? ` · recruiter ${owner.full_name || owner.email}` : ""}
        </p>
      </div>
      <Flash msg={msg} />

      {canEdit && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-ink-faint">Status:</span>
          {(Object.keys(ROLE_STATUS) as (keyof typeof ROLE_STATUS)[]).map((k) => (
            <form key={k} action={setRoleStatus}>
              <input type="hidden" name="id" value={role.id} />
              <input type="hidden" name="status" value={k} />
              <button
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-medium",
                  role.status === k ? "bg-brand-500 text-white" : "bg-fill text-ink-muted hover:text-ink",
                )}
              >
                {ROLE_STATUS[k].label}
              </button>
            </form>
          ))}
        </div>
      )}

      {canEdit && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {BOARD.map((stage) => {
            const list = rcs.filter((r) => r.stage === stage);
            return (
              <div key={stage} className="glass flex min-h-[10rem] flex-col rounded-2xl">
                <div className="flex items-center justify-between border-b border-line px-3 py-2.5">
                  <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                    <span className={cn("h-2 w-2 rounded-full", STAGE_BAR[stage])} />
                    {ROLE_STAGE[stage].label}
                  </span>
                  <span className="text-xs text-ink-faint">{list.length}</span>
                </div>
                <div className="flex-1 space-y-2 p-2">
                  {list.length === 0 && <p className="px-1 py-3 text-center text-xs text-ink-faint">—</p>}
                  {list.map((rc) => {
                    const c = cMap.get(rc.candidate_id);
                    if (!c) return null;
                    return (
                      <div key={rc.id} className="rounded-xl border border-line bg-surface p-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <Link href={`/candidates/${c.id}`} className="min-w-0 text-sm font-medium text-ink hover:text-brand-600">
                            <span className="block truncate">{c.full_name}</span>
                          </Link>
                          <ScoreBadge score={rc.match_score ?? c.ai_score} />
                        </div>
                        <p className="mt-0.5 truncate text-[11px] text-ink-faint">
                          {[c.ai_recommended_role, c.hourly_rate, c.availability, c.country].filter(Boolean).join(" · ") || "—"}
                        </p>
                        {stage === "hired" ? (
                          <p className="mt-2 text-[11px] font-medium text-emerald-600 dark:text-emerald-300">Placed with {clientName} ✓</p>
                        ) : (
                          <div className="mt-2 flex flex-wrap items-center gap-1">
                            <form action={moveRoleCandidate} className="flex items-center gap-1">
                              <input type="hidden" name="id" value={rc.id} />
                              <select name="stage" defaultValue={stage} className="h-7 rounded-md border border-line bg-surface px-1 text-[11px] text-ink">
                                {(["shortlisted", "interview", "offered", "rejected"] as const).map((s) => (
                                  <option key={s} value={s}>{ROLE_STAGE[s].label}</option>
                                ))}
                              </select>
                              <button className="h-7 rounded-md bg-fill px-2 text-[11px] text-ink-muted hover:text-ink">Move</button>
                            </form>
                            <details className="relative">
                              <summary className="flex h-7 cursor-pointer list-none items-center rounded-md bg-emerald-500/15 px-2 text-[11px] font-medium text-emerald-700 hover:bg-emerald-500/25 dark:text-emerald-300">
                                Hire
                              </summary>
                              <form action={hire} className="glass card-glow absolute left-0 z-30 mt-1 w-64 space-y-2 rounded-xl p-3">
                                <input type="hidden" name="id" value={rc.id} />
                                <input type="hidden" name="role_id" value={role.id} />
                                <p className="text-xs font-semibold text-ink">Hire {c.full_name.split(" ")[0]} for {clientName}</p>
                                <div>
                                  <Label>Start date</Label>
                                  <Input name="start_date" type="date" defaultValue={role.start_by ?? ""} />
                                </div>
                                <div className="grid grid-cols-3 gap-1.5">
                                  <div className="col-span-2">
                                    <Label>Rate / hour</Label>
                                    <Input name="hourly_rate" type="number" step="0.01" min={0} placeholder="6.50" />
                                  </div>
                                  <div>
                                    <Label>Cur.</Label>
                                    <Select name="rate_currency" defaultValue="USD">
                                      {["USD", "GBP", "EUR", "PHP", "AUD", "NZD", "CAD"].map((x) => <option key={x}>{x}</option>)}
                                    </Select>
                                  </div>
                                </div>
                                <div>
                                  <Label>Hours / week</Label>
                                  <Input name="hours_per_week" type="number" min={1} max={80} defaultValue={role.hours_per_week ?? ""} />
                                </div>
                                <p className="text-[11px] leading-snug text-ink-faint">Creates the VA placement on {clientName}, marks them hired and starts VA check-ins.</p>
                                <SubmitButton size="sm" pendingText="Hiring…" className="w-full">Confirm hire</SubmitButton>
                              </form>
                            </details>
                            <form action={removeFromRole} className="ml-auto">
                              <input type="hidden" name="id" value={rc.id} />
                              <button title="Remove from this role" className="flex h-7 w-7 items-center justify-center rounded-md text-ink-faint hover:bg-fill hover:text-rose-500">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </form>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        {canEdit && (
          <Card className="lg:col-span-3">
            <CardHeader>
              <CardTitle><Sparkles className="h-3.5 w-3.5 text-accent-500" /> Best matches from the candidate pool</CardTitle>
            </CardHeader>
            <CardBody className="space-y-2">
              {matches.length === 0 && (
                <p className="text-sm text-ink-faint">No strong matches yet. New applicants are scored as they come in; you can also add anyone below.</p>
              )}
              {matches.map(({ candidate: c, fit }) => (
                <div key={c.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2">
                  <div className="w-14 shrink-0">
                    <div className="h-1.5 overflow-hidden rounded-full bg-fill">
                      <div className="bar-grow h-full rounded-full bg-gradient-to-r from-brand-400 to-emerald-400" style={{ width: `${fit}%` }} />
                    </div>
                    <p className="mt-0.5 text-center text-[10px] font-semibold text-ink-muted">{fit}% fit</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <Link href={`/candidates/${c.id}`} className="block truncate text-sm font-medium text-ink hover:text-brand-600">{c.full_name}</Link>
                    <p className="truncate text-[11px] text-ink-faint">
                      {[c.ai_recommended_role, c.experience, c.hourly_rate, c.availability].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <form action={addCandidateToRole}>
                    <input type="hidden" name="role_id" value={role.id} />
                    <input type="hidden" name="candidate_id" value={c.id} />
                    <input type="hidden" name="stage" value="shortlisted" />
                    <button className="inline-flex h-7 items-center gap-1 rounded-md bg-brand-500/10 px-2 text-[11px] font-medium text-brand-700 hover:bg-brand-500/20 dark:text-brand-300">
                      <UserPlus className="h-3.5 w-3.5" /> Shortlist
                    </button>
                  </form>
                </div>
              ))}
              <form action={addCandidateToRole} className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                <input type="hidden" name="role_id" value={role.id} />
                <Select name="candidate_id" required defaultValue="" className="max-w-xs flex-1">
                  <option value="" disabled>Add any candidate…</option>
                  {(pool ?? []).filter((c) => !onRole.has(c.id as string)).map((c) => (
                    <option key={c.id as string} value={c.id as string}>
                      {c.full_name as string}{c.ai_recommended_role ? ` (${c.ai_recommended_role})` : ""}
                    </option>
                  ))}
                </Select>
                <SubmitButton size="sm" variant="secondary" pendingText="Adding…">Add to shortlist</SubmitButton>
              </form>
              {rejected.length > 0 && (
                <p className="pt-1 text-[11px] text-ink-faint">
                  Not progressed: {rejected.map((r) => cMap.get(r.candidate_id)?.full_name).filter(Boolean).join(", ")}
                </p>
              )}
            </CardBody>
          </Card>
        )}

        <Card className={canEdit ? "lg:col-span-2" : "lg:col-span-5"}>
          <CardHeader>
            <CardTitle>Role details</CardTitle>
          </CardHeader>
          <CardBody>
            {canEdit ? (
              <form action={updateRole} className="grid grid-cols-2 gap-2.5">
                <input type="hidden" name="id" value={role.id} />
                <div className="col-span-2">
                  <Label>Role</Label>
                  <Input name="title" defaultValue={role.title} required maxLength={120} list="va-roles-edit" />
                  <datalist id="va-roles-edit">{VA_ROLES.map((r) => <option key={r} value={r} />)}</datalist>
                </div>
                <div>
                  <Label>How many</Label>
                  <Input name="headcount" type="number" min={1} max={50} defaultValue={role.headcount} />
                </div>
                <div>
                  <Label>Type</Label>
                  <Select name="employment_type" defaultValue={role.employment_type}>
                    {Object.entries(EMPLOYMENT_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                </div>
                <div>
                  <Label>Hours / week</Label>
                  <Input name="hours_per_week" type="number" min={1} max={80} defaultValue={role.hours_per_week ?? ""} />
                </div>
                <div>
                  <Label>Budget</Label>
                  <Input name="budget" maxLength={80} defaultValue={role.budget ?? ""} />
                </div>
                <div>
                  <Label>Start by</Label>
                  <Input name="start_by" type="date" defaultValue={role.start_by ?? ""} />
                </div>
                <div>
                  <Label>Priority</Label>
                  <Select name="priority" defaultValue={role.priority}>
                    {Object.entries(ROLE_PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label>Recruiter</Label>
                  <Select name="owner_id" defaultValue={role.owner_id ?? ""}>
                    <option value="">—</option>
                    {profiles.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.full_name || p.email}</option>)}
                  </Select>
                </div>
                <div className="col-span-2">
                  <Label>Requirements</Label>
                  <Textarea name="requirements" defaultValue={role.requirements ?? ""} maxLength={4000} />
                </div>
                <div className="col-span-2">
                  <SubmitButton size="sm" pendingText="Saving…">Save role</SubmitButton>
                </div>
              </form>
            ) : (
              <p className="whitespace-pre-wrap text-sm text-ink-muted">{role.requirements || "No requirements written yet."}</p>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
