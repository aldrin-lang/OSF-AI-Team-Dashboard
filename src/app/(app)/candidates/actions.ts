"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireActor } from "@/lib/server/rbac";
import { ingestCandidate, screenCandidate, sendRecommendation } from "@/lib/server/candidates";
import { CANDIDATE_STATUS } from "@/lib/labels";
import { countryFromPhone } from "@/lib/ops-core";
import type { CandidateStatus } from "@/lib/types";

function s(fd: FormData, k: string): string | null {
  const v = fd.get(k);
  if (v == null) return null;
  const t = String(v).trim();
  return t === "" ? null : t.slice(0, 4000);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function idOf(fd: FormData): string {
  const id = s(fd, "id");
  if (!id || !UUID.test(id)) throw new Error("Missing candidate id");
  return id;
}

const back = (id: string, msg: string) => redirect(`/candidates/${id}?msg=${encodeURIComponent(msg)}`);

/** Manual add (e.g. someone who applied by email). Screens straight away. */
export async function addCandidate(formData: FormData) {
  await requireActor();
  const fullName = s(formData, "full_name");
  if (!fullName) throw new Error("Name is required");
  const email = s(formData, "email")?.toLowerCase() ?? null;
  const phone = s(formData, "phone");
  const about = s(formData, "about");
  const r = await ingestCandidate({
    externalKey: email ? `email:${email}` : null,
    fullName,
    email,
    phone,
    country: countryFromPhone(phone),
    source: s(formData, "source") ?? "Manual",
    appliedRole: s(formData, "applied_role"),
    experience: s(formData, "experience"),
    hourlyRate: s(formData, "hourly_rate"),
    availability: s(formData, "availability"),
    cvUrl: s(formData, "cv_url"),
    portfolioUrl: null,
    answers: about ? { "Notes / about the candidate": about } : {},
  });
  await screenCandidate(r.id);
  revalidatePath("/candidates");
  back(r.id, r.created ? "Candidate added and screened" : "Already on file: details refreshed and re-screened");
}

export async function rescreen(formData: FormData) {
  await requireActor();
  const id = idOf(formData);
  const r = await screenCandidate(id);
  revalidatePath("/candidates");
  revalidatePath(`/candidates/${id}`);
  back(id, r.ok ? "Screening updated" : `Screening failed: ${r.error}`);
}

export async function sendToTeam(formData: FormData) {
  const actor = await requireActor();
  const id = idOf(formData);
  const ok = await sendRecommendation(id, actor.id);
  revalidatePath(`/candidates/${id}`);
  back(id, ok ? "Recommendation sent to managers (in-app + email)" : "Screen the candidate first");
}

export async function updateCandidate(formData: FormData) {
  await requireActor();
  const id = idOf(formData);
  const status = s(formData, "status") as CandidateStatus | null;
  if (!status || !(status in CANDIDATE_STATUS)) throw new Error("Invalid status");
  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("candidates")
    .update({ status, notes: s(formData, "notes") })
    .eq("id", id);
  if (error) throw new Error(error.message);
  revalidatePath("/candidates");
  revalidatePath(`/candidates/${id}`);
}
