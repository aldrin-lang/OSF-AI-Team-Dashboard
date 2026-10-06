"use server";

import { revalidatePath, updateTag } from "next/cache";
import { getServerSupabase, getAdminSupabase } from "@/lib/supabase/server";
import { requireActorRole } from "@/lib/server/rbac";
import { isArea } from "@/lib/areas";
import { redirect } from "next/navigation";

/** Department keys ticked on a form (validated against the departments table). */
async function pickedDepartments(formData: FormData): Promise<string[]> {
  const picked = formData.getAll("departments").map(String);
  if (!picked.length) return [];
  const { data } = await getAdminSupabase().from("departments").select("key").in("key", picked);
  return (data ?? []).map((d) => d.key as string);
}

export async function inviteMember(formData: FormData): Promise<void> {
  await requireActorRole("admin");
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") ?? "").trim();
  const roleRaw = String(formData.get("role") ?? "member");
  const role = ["admin", "manager", "member"].includes(roleRaw) ? roleRaw : "member";
  if (!email) throw new Error("Email required");
  const departments = await pickedDepartments(formData);
  if (role !== "admin" && !departments.length) {
    redirect(`/admin?msg=${encodeURIComponent("Pick at least one department (admins see everything).")}`);
  }

  const admin = getAdminSupabase();
  const mode = formData.get("mode") === "password" ? "password" : "invite";
  let userId: string | undefined;

  if (mode === "password") {
    // Admin sets the first password; the account is confirmed straight away.
    // The password is never logged, echoed back or stored anywhere but Supabase Auth.
    const password = String(formData.get("password") ?? "");
    if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      redirect(`/admin?msg=${encodeURIComponent("Password must be at least 10 characters with letters and numbers.")}`);
    }
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName },
    });
    if (error) redirect(`/admin?msg=${encodeURIComponent(`Couldn't create the account: ${error.message}`)}`);
    userId = data.user?.id;
  } else {
    const redirectTo = `${process.env.APP_URL ?? ""}/auth/confirm?next=/settings`;
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { full_name: fullName },
      redirectTo,
    });
    if (error) redirect(`/admin?msg=${encodeURIComponent(`Invite failed: ${error.message}`)}`);
    userId = data.user?.id;
  }

  // The profile row is created by the auth trigger; set role + departments now so
  // the first login already shows the right tabs.
  if (userId) {
    await admin.from("profiles").update({ role, ...(fullName ? { full_name: fullName } : {}) }).eq("id", userId);
    await admin.from("profile_departments").delete().eq("profile_id", userId);
    if (departments.length) {
      await admin.from("profile_departments").insert(departments.map((d) => ({ profile_id: userId, department: d })));
    }
  }

  updateTag("profiles");
  revalidatePath("/admin");
  redirect(
    `/admin?msg=${encodeURIComponent(
      mode === "password"
        ? `Account created for ${email}. They can log in now with the password you set (share it privately).`
        : `Invite sent to ${email}`,
    )}`,
  );
}

export async function setMemberDepartments(formData: FormData) {
  await requireActorRole("admin");
  const id = String(formData.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) return;
  const departments = await pickedDepartments(formData);
  const supabase = await getServerSupabase();
  await supabase.from("profile_departments").delete().eq("profile_id", id);
  if (departments.length) {
    await supabase.from("profile_departments").insert(departments.map((d) => ({ profile_id: id, department: d })));
  }
  revalidatePath("/admin");
  redirect(`/admin?msg=${encodeURIComponent("Departments saved")}`);
}

/** Which tabs a department can use. */
export async function setDepartmentAreas(formData: FormData) {
  await requireActorRole("admin");
  const dept = String(formData.get("department") ?? "");
  const areas = formData.getAll("areas").map(String).filter(isArea);
  const supabase = await getServerSupabase();
  const { data: exists } = await supabase.from("departments").select("key").eq("key", dept).maybeSingle();
  if (!exists) return;
  await supabase.from("department_areas").delete().eq("department", dept);
  if (areas.length) await supabase.from("department_areas").insert(areas.map((a) => ({ department: dept, area: a })));
  revalidatePath("/admin");
  redirect(`/admin?msg=${encodeURIComponent("Department access saved")}`);
}

export async function setMemberRole(formData: FormData) {
  await requireActorRole("admin");
  const id = String(formData.get("id") ?? "");
  const role = String(formData.get("role") ?? "");
  if (!id || !["admin", "manager", "member"].includes(role)) return;
  const supabase = await getServerSupabase();
  await supabase.from("profiles").update({ role }).eq("id", id);
  updateTag("profiles");
  revalidatePath("/admin");
}

export async function setMemberActive(formData: FormData) {
  await requireActorRole("admin");
  const id = String(formData.get("id") ?? "");
  const active = formData.get("active") === "true";
  if (!id) return;
  const supabase = await getServerSupabase();
  await supabase.from("profiles").update({ active }).eq("id", id);
  updateTag("profiles");
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
  updateTag("lookups");
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
  updateTag("lookups");
  revalidatePath("/admin");
}

export async function removeOption(formData: FormData) {
  await requireActorRole("admin");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await getServerSupabase();
  await supabase.from("option_lists").update({ active: false }).eq("id", id);
  updateTag("lookups");
  revalidatePath("/admin");
}

export async function saveEmailTemplate(formData: FormData) {
  await requireActorRole("admin");
  const supabase = await getServerSupabase();
  const id = String(formData.get("id") ?? "");
  const row = {
    name: String(formData.get("name") ?? "").trim(),
    subject: String(formData.get("subject") ?? "").trim(),
    body: String(formData.get("body") ?? ""),
    trigger: String(formData.get("trigger") ?? "manual"),
    active: formData.get("active") === "on",
  };
  if (!row.name || !row.subject) return;
  if (id) await supabase.from("email_templates").update(row).eq("id", id);
  else await supabase.from("email_templates").insert(row);
  revalidatePath("/admin");
}

export async function deleteEmailTemplate(formData: FormData) {
  await requireActorRole("admin");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const supabase = await getServerSupabase();
  await supabase.from("email_templates").delete().eq("id", id);
  revalidatePath("/admin");
}
