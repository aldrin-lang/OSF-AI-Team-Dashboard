import { redirect } from "next/navigation";
import { cache } from "react";
import { getServerSupabase } from "@/lib/supabase/server";
import type { Profile, UserRole } from "@/lib/types";

/** Current auth user + profile row, or null. Memoised per request. */
export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await getServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  return (data as Profile | null) ?? null;
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
