"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireActor } from "@/lib/server/rbac";
import { logActivity } from "@/lib/server/activity";
import { notifyUsers } from "@/lib/server/notify";

function s(fd: FormData, k: string) {
  const v = fd.get(k);
  const t = v == null ? "" : String(v).trim();
  return t === "" ? null : t;
}

export async function createConcern(formData: FormData) {
  const actor = await requireActor();
  const supabase = await getServerSupabase();

  const clientId = s(formData, "client_id");
  const title = s(formData, "title");
  if (!clientId || !title) throw new Error("Client and title are required");

  const { data: concern, error } = await supabase
    .from("concerns")
    .insert({
      client_id: clientId,
      raised_by: actor.id,
      title,
      description: s(formData, "description"),
      type: s(formData, "type"),
      severity: s(formData, "severity") ?? "medium",
      owner_id: s(formData, "owner_id"),
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await logActivity({
    entity: "concern",
    entityId: concern.id,
    verb: "created",
    summary: `Raised: ${title}`,
  });

  const { data: client } = await supabase
    .from("clients")
    .select("name, manager_id")
    .eq("id", clientId)
    .single();

  const recipients = [client?.manager_id, s(formData, "owner_id")].filter(Boolean) as string[];
  if (recipients.length) {
    await notifyUsers({
      userIds: recipients,
      event: "concern_my_client",
      title: `New concern: ${client?.name ?? "client"}`,
      body: title,
      link: `/concerns/${concern.id}`,
      exclude: actor.id,
    });
  }

  revalidatePath("/concerns");
  redirect(`/concerns/${concern.id}`);
}

export async function updateConcern(formData: FormData) {
  const actor = await requireActor();
  const supabase = await getServerSupabase();
  const id = s(formData, "id");
  if (!id) throw new Error("Missing id");

  const patch: Record<string, unknown> = {};
  for (const f of ["severity", "type", "owner_id", "resolution"] as const)
    if (formData.has(f)) patch[f] = s(formData, f);

  if (formData.has("status")) {
    const status = s(formData, "status");
    patch.status = status;
    patch.resolved_at = status === "resolved" ? new Date().toISOString() : null;
  }

  const { error } = await supabase.from("concerns").update(patch).eq("id", id);
  if (error) throw new Error(error.message);

  await logActivity({
    entity: "concern",
    entityId: id,
    verb: "updated",
    summary: patch.status ? `Status: ${patch.status}` : `Updated ${Object.keys(patch).join(", ")}`,
    changes: patch as Record<string, unknown>,
  });

  revalidatePath(`/concerns/${id}`);
  revalidatePath("/concerns");
  void actor;
}
