import { redirect } from "next/navigation";
import { cache } from "react";
import { getServerSupabase } from "@/lib/supabase/server";
import { AREAS, homeFor, isArea, type Area } from "@/lib/areas";
import type { Profile, UserRole } from "@/lib/types";

/** Current auth user + profile row, or null. Memoised per request. */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await getServerSupabase();
  // getClaims() verifies the JWT locally against the project's ES256 JWKS —
  // no network round-trip to the auth server on every page load.
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();

  return (profile as Profile | null) ?? null;
});

/** Redirect to /login when signed out; to /inactive when the account is disabled. */
export async function requireProfile(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!profile.active) redirect("/inactive");
  return profile;
}

const RANK: Record<UserRole, number> = { member: 0, manager: 1, admin: 2 };

export function hasRole(profile: Profile, min: UserRole): boolean {
  return RANK[profile.role] >= RANK[min];
}

export async function requireRole(min: UserRole): Promise<Profile> {
  const profile = await requireProfile();
  if (!hasRole(profile, min)) redirect("/");
  return profile;
}

/** Areas the signed-in user may use (admins: all). Memoised per request. */
export const getMyAreas = cache(async (): Promise<Area[]> => {
  const profile = await getCurrentProfile();
  if (!profile || !profile.active) return [];
  if (profile.role === "admin") return [...AREAS];
  const supabase = await getServerSupabase();
  const { data: mine } = await supabase.from("profile_departments").select("department").eq("profile_id", profile.id);
  const depts = (mine ?? []).map((r) => r.department as string);
  if (!depts.length) return [];
  const { data: rows } = await supabase.from("department_areas").select("area").in("department", depts);
  return [...new Set((rows ?? []).map((r) => r.area).filter(isArea))];
});

/** Page guard: signed in, active, and allowed into this area; otherwise sent to their own home. */
export async function requireArea(area: Area): Promise<Profile> {
  const profile = await requireProfile();
  const areas = await getMyAreas();
  if (!areas.includes(area)) redirect(homeFor(areas));
  return profile;
}
