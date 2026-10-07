"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireActorArea } from "@/lib/server/rbac";
import { fitScore, hireCandidate } from "@/lib/server/staffing";
import { ROLE_PRIORITY, ROLE_STAGE, ROLE_STATUS } from "@/lib/labels";
import type { Candidate, RoleCandidateStage, RolePriority, RoleStatus } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CURRENCIES = ["GBP", "EUR", "NZD", "AUD", "CAD", "USD", "PHP"];

function s(fd: FormData, k: string, max = 2000): string | null {
  const v = String(fd.get(k) ?? "").trim();
  return v ? v.slice(0, max) : null;
}
function int(fd: FormData, k: string, min: number, max: number): number | null {
  const n = Number(s(fd, k));
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : null;
}
function uuid(fd: FormData, k: string): string {
  const v = s(fd, k);
  if (!v || !UUID.test(v)) throw new Error(`Missing ${k}`);
  return v;
}
const back = (path: string, msg: string) => redirect(`${path}?msg=${encodeURIComponent(msg)}`);

function roleFields(fd: FormData) {
  const emp = s(fd, "employment_type");
  const pr = s(fd, "priority");
  const date = s(fd, "start_by");
  return {
    title: s(fd, "title", 120),
    headcount: int(fd, "headcount", 1, 50) ?? 1,
    employment_type: emp === "part_time" || emp === "project" ? emp : "full_time",
    hours_per_week: int(fd, "hours_per_week", 1, 80),
    budget: s(fd, "budget", 80),
    start_by: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
    priority: (pr && pr in ROLE_PRIORITY ? pr : "normal") as RolePriority,
    requirements: s(fd, "requirements", 4000),
    owner_id: s(fd, "owner_id") && UUID.test(s(fd, "owner_id")!) ? s(fd, "owner_id") : null,
  };
}

export async function createRole(formData: FormData) {
  const me = await requireActorArea("candidates");
  const client_id = uuid(formData, "client_id");
  const f = roleFields(formData);
  if (!f.title) back("/roles", "Give the role a title");
  const supabase = await getServerSupabase();
  const { data, error } = await supabase
    .from("va_roles")
    .insert({ ...f, client_id, created_by: me.id, owner_id: f.owner_id ?? me.id })
    .select("id")
    .single();
  if (error || !data) back("/roles", `Couldn't create the role: ${error?.message}`);
  revalidatePath("/roles");
  redirect(`/roles/${data!.id}?msg=${encodeURIComponent("Role opened. Matching candidates are suggested below.")}`);
}

export async function updateRole(formData: FormData) {
  await requireActorArea("candidates");
  const id = uuid(formData, "id");
  const f = roleFields(formData);
  if (!f.title) back(`/roles/${id}`, "Title can't be empty");
  const supabase = await getServerSupabase();
  await supabase.from("va_roles").update(f).eq("id", id);
  revalidatePath(`/roles/${id}`);
  revalidatePath("/roles");
  back(`/roles/${id}`, "Role saved");
}

export async function setRoleStatus(formData: FormData) {
  await requireActorArea("candidates");
  const id = uuid(formData, "id");
  const status = s(formData, "status") as RoleStatus | null;
  if (!status || !(status in ROLE_STATUS)) return;
  const supabase = await getServerSupabase();
  await supabase.from("va_roles").update({ status }).eq("id", id);
  revalidatePath(`/roles/${id}`);
  revalidatePath("/roles");
}

export async function addCandidateToRole(formData: FormData) {
  const me = await requireActorArea("candidates");
  const role_id = uuid(formData, "role_id");
  const candidate_id = uuid(formData, "candidate_id");
  const stage = (s(formData, "stage") ?? "shortlisted") as RoleCandidateStage;
  const supabase = await getServerSupabase();
  const [{ data: role }, { data: cand }] = await Promise.all([
    supabase.from("va_roles").select("title, status").eq("id", role_id).single(),
    supabase.from("candidates").select("*").eq("id", candidate_id).single(),
  ]);
  if (!role || !cand) return;
  await supabase.from("va_role_candidates").upsert(
    {
      role_id,
      candidate_id,
      stage: stage in ROLE_STAGE ? stage : "shortlisted",
      match_score: fitScore(cand as Candidate, role.title),
      added_by: me.id,
    },
    { onConflict: "role_id,candidate_id" },
  );
  // keep the candidate's own status in step
  if ((cand as Candidate).status === "new" || (cand as Candidate).status === "screened") {
    await supabase.from("candidates").update({ status: "shortlisted" }).eq("id", candidate_id);
  }
  if (role.status === "open") await supabase.from("va_roles").update({ status: "sourcing" }).eq("id", role_id);
  revalidatePath(`/roles/${role_id}`);
}

const CANDIDATE_STATUS_FOR: Partial<Record<RoleCandidateStage, string>> = {
  shortlisted: "shortlisted",
  interview: "interview",
  offered: "interview",
};

export async function moveRoleCandidate(formData: FormData) {
  await requireActorArea("candidates");
  const id = uuid(formData, "id");
  const stage = s(formData, "stage") as RoleCandidateStage | null;
  if (!stage || !(stage in ROLE_STAGE) || stage === "hired") return;
  const supabase = await getServerSupabase();
  const { data: rc } = await supabase.from("va_role_candidates").update({ stage }).eq("id", id).select("role_id, candidate_id").single();
  if (!rc) return;
  const cs = CANDIDATE_STATUS_FOR[stage];
  if (cs) await supabase.from("candidates").update({ status: cs }).eq("id", rc.candidate_id).neq("status", "hired");
  if (stage === "interview" || stage === "offered") {
    const next = stage === "offered" ? "offer" : "interviewing";
    await supabase.from("va_roles").update({ status: next }).eq("id", rc.role_id).in("status", ["open", "sourcing", "interviewing"]);
  }
  revalidatePath(`/roles/${rc.role_id}`);
}

export async function removeFromRole(formData: FormData) {
  await requireActorArea("candidates");
  const id = uuid(formData, "id");
  const supabase = await getServerSupabase();
  const { data } = await supabase.from("va_role_candidates").delete().eq("id", id).select("role_id").single();
  if (data) revalidatePath(`/roles/${data.role_id}`);
}

export async function hire(formData: FormData) {
  const me = await requireActorArea("candidates");
  const id = uuid(formData, "id");
  const roleId = uuid(formData, "role_id");
  const rate = Number(s(formData, "hourly_rate"));
  const cur = s(formData, "rate_currency") ?? "USD";
  const date = s(formData, "start_date");
  const r = await hireCandidate(
    {
      roleCandidateId: id,
      startDate: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
      hourlyRate: Number.isFinite(rate) && rate >= 0 && s(formData, "hourly_rate") ? rate : null,
      currency: CURRENCIES.includes(cur) ? cur : "USD",
      hoursPerWeek: int(formData, "hours_per_week", 1, 80),
    },
    me,
  );
  revalidatePath(`/roles/${roleId}`);
  revalidatePath("/roles");
  revalidatePath("/vas");
  back(`/roles/${roleId}`, r.message);
}
