"use server";

import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireActor } from "@/lib/server/rbac";

const BOOL_KEYS = [
  "assigned_to_me_in_app",
  "assigned_to_me_email",
  "mention_in_app",
  "mention_email",
  "stage_change_my_client_in_app",
  "stage_change_my_client_email",
  "concern_my_client_in_app",
  "concern_my_client_email",
  "stale_client_in_app",
  "stale_client_email",
] as const;

export async function saveNotificationPrefs(formData: FormData) {
  const actor = await requireActor();
  const supabase = await getServerSupabase();

  const patch: Record<string, unknown> = { user_id: actor.id };
  for (const k of BOOL_KEYS) patch[k] = formData.get(k) === "on";
  patch.digest = String(formData.get("digest") ?? "daily");

  const { error } = await supabase
    .from("notification_preferences")
    .upsert(patch, { onConflict: "user_id" });
  if (error) throw new Error(error.message);

  revalidatePath("/settings");
}

export async function updateMyName(formData: FormData) {
  const actor = await requireActor();
  const supabase = await getServerSupabase();
  const full_name = String(formData.get("full_name") ?? "").trim();
  if (!full_name) return;
  await supabase.from("profiles").update({ full_name }).eq("id", actor.id);
  revalidatePath("/settings");
  revalidatePath("/", "layout");
}
