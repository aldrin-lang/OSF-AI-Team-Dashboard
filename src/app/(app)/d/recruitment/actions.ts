"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireActorArea } from "@/lib/server/rbac";
import { isIsoDate } from "@/lib/ops-core";
import { FEE_STATUSES, OB_STATUSES, ROLE_STAGES, roleStatusFor, type RoleStage } from "@/lib/ops-records";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STALE = "Someone else changed this just now. Reload the page and try again.";

function s(fd: FormData, k: string, max = 2000): string | null {
  const v = fd.get(k);
  if (v == null) return null;
  const t = String(v).trim();
  return t === "" ? null : t.slice(0, max);
}
function idOf(fd: FormData, k = "id"): string {
  const id = s(fd, k);
  if (!id || !UUID.test(id)) throw new Error("Missing id");
  return id;
}
function back(fd: FormData, msg: string): never {
  const to = s(fd, "back") ?? "/d/recruitment/requests";
  const path = /^\/d\/recruitment\/[a-z-]+(\?[\w=&%.+-]*)?$/i.test(to) ? to : "/d/recruitment/requests";
  redirect(`${path}${path.includes("?") ? "&" : "?"}msg=${encodeURIComponent(msg)}`);
}
function dates(fd: FormData, keys: string[]): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const k of keys) {
    const v = s(fd, k);
    if (v != null && !isIsoDate(v)) back(fd, "Check the dates");
    out[k] = v;
  }
  return out;
}
function done(fd: FormData, msg: string): never {
  revalidatePath("/d/recruitment", "layout");
  back(fd, msg);
}
/** Update one row only if nobody changed it since the form was opened. */
async function versioned(table: string, fd: FormData, patch: Record<string, unknown>) {
  const supabase = await getServerSupabase();
  const { data, error } = await supabase.from(table).update(patch).eq("id", idOf(fd)).eq("updated_at", s(fd, "updated_at") ?? "").select("id");
  if (error) back(fd, `Couldn't save: ${error.message}`);
  if (!data?.length) back(fd, STALE);
}

// ---------------------------------------------------------------- client requests (va_roles)

export async function saveRequest(fd: FormData) {
  const actor = await requireActorArea("candidates");
  const id = s(fd, "id");
  const stage = (s(fd, "stage") ?? "cv_pooling") as RoleStage;
  if (!(ROLE_STAGES as readonly string[]).includes(stage)) back(fd, "Unknown stage");
  const title = s(fd, "title", 120);
  if (!title) back(fd, "Write the VA title");
  const row = {
    title,
    stage,
    status: roleStatusFor(stage),
    ...dates(fd, ["requested_on", "closed_on"]),
    manager_name: s(fd, "manager_name", 80),
    sdr: s(fd, "sdr", 80),
    hire_type: s(fd, "hire_type", 40),
    country: s(fd, "country", 80),
    va_type: s(fd, "va_type", 200),
    industry: s(fd, "industry", 200),
    work_arrangement: s(fd, "work_arrangement", 200),
    interview_schedule: s(fd, "interview_schedule", 200),
    reengagement_status: s(fd, "reengagement_status", 80),
    rework_reason: s(fd, "rework_reason"),
    hiring_notes: s(fd, "hiring_notes"),
    requirements: s(fd, "requirements", 4000),
    notes: s(fd, "notes"),
  };
  if (id) await versioned("va_roles", fd, row);
  else {
    const supabase = await getServerSupabase();
    const { error } = await supabase.from("va_roles").insert({ ...row, client_id: idOf(fd, "client_id"), created_by: actor.id });
    if (error) back(fd, `Couldn't save: ${error.message}`);
  }
  done(fd, id ? "Request updated" : "Request added");
}

/** Move a request to another stage in one click. */
export async function setRequestStage(fd: FormData) {
  await requireActorArea("candidates");
  const stage = s(fd, "stage") as RoleStage;
  if (!(ROLE_STAGES as readonly string[]).includes(stage)) back(fd, "Unknown stage");
  await versioned("va_roles", fd, { stage, status: roleStatusFor(stage), stage_detail: null });
  done(fd, "Stage updated");
}

/** Add an endorsed candidate (name, email, CV, portfolio) to a request. */
export async function addEndorsed(fd: FormData) {
  await requireActorArea("candidates");
  const name = s(fd, "name", 120);
  if (!name) back(fd, "Write the candidate's name");
  const supabase = await getServerSupabase();
  const { data: role } = await supabase.from("va_roles").select("endorsed").eq("id", idOf(fd)).maybeSingle();
  if (!role) back(fd, "Request not found");
  const list = Array.isArray(role.endorsed) ? role.endorsed : [];
  if (list.length >= 30) back(fd, "That's the most candidates one request can hold");
  await versioned("va_roles", fd, { endorsed: [...list, { name, email: s(fd, "email", 200) ?? "", cv: s(fd, "cv", 500) ?? "", portfolio: s(fd, "portfolio", 500) ?? "" }] });
  done(fd, `${name} added`);
}

export async function removeEndorsed(fd: FormData) {
  await requireActorArea("candidates");
  const at = Number(s(fd, "index"));
  const supabase = await getServerSupabase();
  const { data: role } = await supabase.from("va_roles").select("endorsed").eq("id", idOf(fd)).maybeSingle();
  if (!role || !Array.isArray(role.endorsed) || !Number.isInteger(at) || at < 0 || at >= role.endorsed.length) back(fd, "Candidate not found");
  await versioned("va_roles", fd, { endorsed: role.endorsed.filter((_: unknown, i: number) => i !== at) });
  done(fd, "Candidate removed");
}

// ---------------------------------------------------------------- onboarding + hiring fees

export async function saveOnboarding(fd: FormData) {
  const actor = await requireActorArea("candidates");
  const id = s(fd, "id");
  const ob = s(fd, "ob_status") ?? "to_schedule";
  const fee = s(fd, "fee_status") ?? "to_send";
  if (!(OB_STATUSES as readonly string[]).includes(ob) || !(FEE_STATUSES as readonly string[]).includes(fee)) back(fd, "Unknown status");
  const row = {
    va_name: s(fd, "va_name", 120),
    va_email: s(fd, "va_email", 200),
    va_cv: s(fd, "va_cv", 500),
    role: s(fd, "role", 200),
    employment_type: s(fd, "employment_type", 40),
    sales_type: s(fd, "sales_type", 40),
    ...dates(fd, ["closed_on", "ob_date", "start_date"]),
    closed_by: s(fd, "closed_by", 80),
    manager_name: s(fd, "manager_name", 80),
    contacted_by_am: s(fd, "contacted_by_am", 80),
    ob_status: ob,
    ob_status_detail: s(fd, "ob_status_detail", 80),
    country: s(fd, "country", 80),
    campaign_status: s(fd, "campaign_status", 80),
    fee_status: fee,
    fee_invoice: s(fd, "fee_invoice", 80),
    fee_paid: s(fd, "fee_paid", 80),
    notes: s(fd, "notes"),
    updated_by: actor.id,
  };
  if (id) await versioned("onboardings", fd, row);
  else {
    const supabase = await getServerSupabase();
    const { error } = await supabase.from("onboardings").insert({ ...row, client_id: idOf(fd, "client_id"), created_by: actor.id });
    if (error) back(fd, `Couldn't save: ${error.message}`);
  }
  done(fd, id ? "Onboarding updated" : "Onboarding added");
}

/** Quick onboarding status (and OB date). */
export async function setObStatus(fd: FormData) {
  const actor = await requireActorArea("candidates");
  const ob = s(fd, "ob_status");
  if (!ob || !(OB_STATUSES as readonly string[]).includes(ob)) back(fd, "Unknown status");
  await versioned("onboardings", fd, { ob_status: ob, ob_status_detail: null, ...dates(fd, ["ob_date"]), updated_by: actor.id });
  done(fd, "Onboarding updated");
}

/** Quick hiring fee update: status, invoice number, amount/notes paid. */
export async function setFee(fd: FormData) {
  const actor = await requireActorArea("candidates");
  const fee = s(fd, "fee_status");
  if (!fee || !(FEE_STATUSES as readonly string[]).includes(fee)) back(fd, "Unknown status");
  await versioned("onboardings", fd, { fee_status: fee, fee_status_detail: null, fee_invoice: s(fd, "fee_invoice", 80), fee_paid: s(fd, "fee_paid", 80), updated_by: actor.id });
  done(fd, "Hiring fee updated");
}
