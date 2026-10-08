import "server-only";
import { getServerSupabase, getAdminSupabase } from "@/lib/supabase/server";
import { logActivity } from "@/lib/server/activity";
import { areaUserIds, notifyUsers } from "@/lib/server/notify";
import { EMPLOYMENT_TYPE } from "@/lib/labels";
import type { Candidate, Profile, VaRole } from "@/lib/types";

/**
 * Client names for roles/placements. Recruitment can't read the clients table
 * (that's the Clients area), so names come from the service-role client — only
 * id + name, and only after the caller's area check.
 */
export async function clientNames(ids?: string[]): Promise<Map<string, string>> {
  let q = getAdminSupabase().from("clients").select("id, name").order("name");
  if (ids) {
    if (!ids.length) return new Map();
    q = q.in("id", [...new Set(ids)]);
  }
  const { data } = await q.limit(2000);
  return new Map((data ?? []).map((c) => [c.id as string, c.name as string]));
}

const words = (s: string | null | undefined) =>
  (s ?? "")
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 2 && !["virtual", "assistant", "the", "and"].includes(w));

/** 0–100: how well a candidate fits a role title (AI role match + AI score + keyword overlap). */
export function fitScore(c: Candidate, title: string): number {
  const t = title.trim().toLowerCase();
  let s = 0;
  if ((c.ai_recommended_role ?? "").toLowerCase() === t) s += 55;
  else if ((c.ai_alt_roles ?? []).some((r) => r.toLowerCase() === t)) s += 35;
  const tw = new Set(words(title));
  const cw = [...words(c.applied_role), ...words(c.ai_recommended_role), ...words(c.experience)];
  if (tw.size && cw.some((w) => tw.has(w))) s += 15;
  s += Math.round((c.ai_score ?? 50) * 0.3);
  return Math.max(0, Math.min(100, s));
}

/** Best candidates for a role who aren't already on it, hired or rejected. */
export async function matchCandidates(role: Pick<VaRole, "id" | "title">, limit = 8) {
  const supabase = await getServerSupabase();
  const [{ data: cands }, { data: onRole }] = await Promise.all([
    supabase
      .from("candidates")
      .select("*")
      .in("status", ["new", "screened", "shortlisted", "interview"])
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase.from("va_role_candidates").select("candidate_id").eq("role_id", role.id),
  ]);
  const taken = new Set((onRole ?? []).map((r) => r.candidate_id as string));
  return ((cands as Candidate[]) ?? [])
    .filter((c) => !taken.has(c.id))
    .map((c) => ({ candidate: c, fit: fitScore(c, role.title) }))
    .filter((m) => m.fit >= 30)
    .sort((a, b) => b.fit - a.fit)
    .slice(0, limit);
}

export interface HireInput {
  roleCandidateId: string;
  startDate: string | null;
  hourlyRate: number | null;
  currency: string;
  hoursPerWeek: number | null;
}

/**
 * Hire: creates the VA placement on the client, marks the candidate hired and
 * the role filled once every seat is taken, and tells the Clients team.
 */
export async function hireCandidate(input: HireInput, me: Profile): Promise<{ ok: boolean; message: string; clientId?: string; placementId?: string }> {
  const supabase = await getServerSupabase();
  const { data: rc } = await supabase.from("va_role_candidates").select("*").eq("id", input.roleCandidateId).maybeSingle();
  if (!rc) return { ok: false, message: "That candidate isn't on this role any more." };
  const [{ data: role }, { data: cand }] = await Promise.all([
    supabase.from("va_roles").select("*").eq("id", rc.role_id).single(),
    supabase.from("candidates").select("*").eq("id", rc.candidate_id).single(),
  ]);
  if (!role || !cand) return { ok: false, message: "Couldn't load the role or candidate." };
  const r = role as VaRole;
  const c = cand as Candidate;

  // Placement + stages + role status in one transaction with the role locked
  // (hire_candidate in SQL): no duplicate placements, no hiring past headcount.
  const { data: hired, error } = await supabase
    .rpc("hire_candidate", {
      p_role_candidate_id: rc.id,
      p_employment_type: EMPLOYMENT_TYPE[r.employment_type],
      p_start_date: input.startDate,
      p_hourly_rate: input.hourlyRate,
      p_currency: input.currency,
      p_hours_per_week: input.hoursPerWeek,
    })
    .single();
  if (error || !hired) return { ok: false, message: error?.message ?? "Couldn't create the placement." };
  const h = hired as { placement_id: string; role_filled: boolean; already_hired: boolean };
  const placementId = h.placement_id;
  const filled = h.role_filled;
  if (h.already_hired) {
    return { ok: true, clientId: r.client_id, placementId, message: `${c.full_name} is already hired for this role.` };
  }

  const clientName = (await clientNames([r.client_id])).get(r.client_id) ?? "the client";
  await logActivity({
    entity: "client",
    entityId: r.client_id,
    verb: "placement",
    summary: `${c.full_name} hired as ${r.title}${input.startDate ? ` (starts ${input.startDate})` : ""}`,
  }).catch(() => {});
  await notifyUsers({
    userIds: await areaUserIds("clients"),
    event: "va_placed",
    title: `New VA placed: ${c.full_name} → ${clientName}`,
    body: `${r.title}${input.startDate ? `, starting ${input.startDate}` : ""}. Check-ins will start automatically.`,
    link: `/vas`,
    exclude: me.id,
  }).catch(() => {});

  return {
    ok: true,
    clientId: r.client_id,
    placementId,
    message: `${c.full_name} is hired for ${clientName}${filled ? " and the role is now filled" : ""}.`,
  };
}
