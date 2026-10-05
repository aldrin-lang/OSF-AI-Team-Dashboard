import "server-only";
import { getCurrentProfile, getMyAreas } from "@/lib/auth";
import type { Area } from "@/lib/areas";
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

/** Server-action guard for an area (needed where the action uses the service-role client). */
export async function requireActorArea(area: Area, minRole: UserRole = "member"): Promise<Profile> {
  const profile = await requireActorRole(minRole);
  if (!(await getMyAreas()).includes(area)) throw new Error("Not allowed for your department");
  return profile;
}
