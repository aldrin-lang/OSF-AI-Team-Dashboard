import "server-only";
import { getCurrentProfile } from "@/lib/auth";
import type { Profile, UserRole } from "@/lib/types";

const RANK: Record<UserRole, number> = { member: 0, manager: 1, admin: 2 };

export async function requireActor(): Promise<Profile> {
  const profile = await getCurrentProfile();
  if (!profile || !profile.active) throw new Error("Not authorised");
  return profile;
}

export async function requireActorRole(min: UserRole): Promise<Profile> {
  const profile = await requireActor();
  if (RANK[profile.role] < RANK[min]) throw new Error("Insufficient permissions");
  return profile;
}
