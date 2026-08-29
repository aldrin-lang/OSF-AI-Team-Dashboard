"use server";

import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireActor } from "@/lib/server/rbac";

export async function markRead(formData: FormData) {
  const actor = await requireActor();
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await getServerSupabase();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", actor.id);
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
}

export async function markAllRead() {
  const actor = await requireActor();
  const supabase = await getServerSupabase();
  await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .is("read_at", null)
    .eq("user_id", actor.id);
  revalidatePath("/notifications");
  revalidatePath("/", "layout");
}
