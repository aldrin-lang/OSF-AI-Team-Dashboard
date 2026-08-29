"use server";

import { revalidatePath } from "next/cache";
import { getServerSupabase, getAdminSupabase } from "@/lib/supabase/server";
import { requireActorRole } from "@/lib/server/rbac";

export async function inviteMember(formData: FormData): Promise<void> {
  await requireActorRole("admin");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim();
  if (!email) throw new Error("Email required");

  const admin = getAdminSupabase();
  const redirectTo = `${process.env.APP_URL ?? ""}/login`;
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/admin");
}

export async function setMemberRole(formData: FormData) {
  await requireActorRole("admin");
  const id = String(formData.get("id") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!id || !["admin", "manager", "member"].includes(role)) return;
  const supabase = await getServerSupabase();
  await supabase.from("profiles").update({ role }).eq("id", id);
  revalidatePath("/admin");
}

export async function setMemberActive(formData: FormData) {
  await requireActorRole("admin");
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (!id) return;
  const supabase = await getServerSupabase();
  await supabase.from("profiles").update({ active }).eq("id", id);
  revalidatePath("/admin");
}

export async function updateStage(formData: FormData) {
  await requireActorRole("admin");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const name = String(formData.get("name") ?? "").trim();
  const slaRaw = String(formData.get("sla_days") ?? "").trim();
  const sla_days = slaRaw === "" ? null : Number(slaRaw);
  const supabase = await getServerSupabase();
  await supabase
    .from("pipeline_stages")
    .update({ name, sla_days: Number.isFinite(sla_days as number) ? sla_days : null })
    .eq("id", id);
  revalidatePath("/admin");
  revalidatePath("/pipeline");
}

export async function addOption(formData: FormData) {
  await requireActorRole("admin");
  const kind = String(formData.get("kind") ?? "");
  const value = String(formData.get("value") ?? "").trim();
  if (!kind || !value) return;
  const supabase = await getServerSupabase();
  await supabase.from("option_lists").insert({ kind, value, position: 99 });
  revalidatePath("/admin");
}

export async function removeOption(formData: FormData) {
  await requireActorRole("admin");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await getServerSupabase();
  await supabase.from("option_lists").update({ active: false }).eq("id", id);
  revalidatePath("/admin");
}
