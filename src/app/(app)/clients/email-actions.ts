"use server";

import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireActor } from "@/lib/server/rbac";
import { logActivity } from "@/lib/server/activity";
import { notifyUsers } from "@/lib/server/notify";
import { sendEmail } from "@/lib/server/email";
import { renderTemplate, buildClientVars } from "@/lib/email-render";
import { getStages } from "@/lib/data/queries";
import type { Client, ClientEmail, ClientLine, EmailTemplate, Profile } from "@/lib/types";

async function loadContext(clientId: string) {
  const supabase = await getServerSupabase();
  const [{ data: client }, { data: lines }, stages] = await Promise.all([
    supabase.from("clients").select("*").eq("id", clientId).single(),
    supabase.from("client_lines").select("*").eq("client_id", clientId).order("created_at"),
    getStages(),
  ]);
  const c = client as Client;
  let manager: Profile | null = null;
  if (c.manager_id) {
    const { data } = await supabase.from("profiles").select("*").eq("id", c.manager_id).maybeSingle();
    manager = (data as Profile | null) ?? null;
  }
  const stage = stages.find((s) => s.id === c.stage_id) ?? null;
  return { supabase, client: c, lines: (lines as ClientLine[]) ?? [], manager, stage };
}

export async function generateEmailDraft(input: { clientId: string; templateId: string }) {
  const actor = await requireActor();
  const { supabase, client, lines, manager, stage } = await loadContext(input.clientId);

  const { data: tpl } = await supabase
    .from("email_templates")
    .select("*")
    .eq("id", input.templateId)
    .single();
  const template = tpl as EmailTemplate;
  const vars = buildClientVars(client, lines, manager, stage);

  const { data: row, error } = await supabase
    .from("client_emails")
    .insert({
      client_id: input.clientId,
      template_id: template.id,
      to_email: client.contact_email,
      subject: renderTemplate(template.subject, vars),
      body: renderTemplate(template.body, vars),
      created_by: actor.id,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  await logActivity({
    entity: "client",
    entityId: input.clientId,
    verb: "email",
    summary: `Drafted email: ${template.name}`,
  });
  revalidatePath(`/clients/${input.clientId}`);
  return row.id as string;
}

export async function updateEmailDraft(formData: FormData) {
  await requireActor();
  const supabase = await getServerSupabase();
  const id = String(formData.get("id") ?? "");
  const clientId = String(formData.get("client_id") ?? "");
  if (!id) return;
  const { error } = await supabase
    .from("client_emails")
    .update({
      to_email: String(formData.get("to_email") ?? "").trim() || null,
      subject: String(formData.get("subject") ?? "").trim(),
      body: String(formData.get("body") ?? ""),
    })
    .eq("id", id)
    .eq("status", "draft");
  if (error) throw new Error(error.message);
  revalidatePath(`/clients/${clientId}`);
}

export async function sendClientEmail(input: { id: string; clientId: string }) {
  const actor = await requireActor();
  const supabase = await getServerSupabase();

  const { data: draft } = await supabase
    .from("client_emails")
    .select("*")
    .eq("id", input.id)
    .single();
  const email = draft as ClientEmail;
  if (!email) return { ok: false, error: "Not found" };
  if (email.status === "sent") return { ok: false, error: "Already sent" };
  if (!email.to_email) return { ok: false, error: "Add a recipient email first" };

  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.6;color:#111;white-space:pre-wrap">${email.body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/\n/g, "<br/>")}</div>`;

  const res = await sendEmail({ to: email.to_email, subject: email.subject, html, text: email.body });
  if (!res.ok) return { ok: false, error: "Email provider rejected the send" };
  if (res.skipped) return { ok: false, error: "Email sending isn't set up yet (RESEND_API_KEY / EMAIL_FROM). The draft was not sent." };

  await supabase
    .from("client_emails")
    .update({ status: "sent", sent_by: actor.id, sent_at: new Date().toISOString() })
    .eq("id", input.id);

  await logActivity({
    entity: "client",
    entityId: input.clientId,
    verb: "email",
    summary: `Sent email to ${email.to_email}: ${email.subject}`,
  });

  const { data: client } = await supabase
    .from("clients")
    .select("manager_id, name")
    .eq("id", input.clientId)
    .single();
  if (client?.manager_id) {
    await notifyUsers({
      userIds: [client.manager_id],
      event: "stage_change_my_client",
      title: `Email sent to ${client.name}`,
      body: email.subject,
      link: `/clients/${input.clientId}`,
      exclude: actor.id,
    });
  }

  revalidatePath(`/clients/${input.clientId}`);
  return { ok: true };
}

export async function deleteEmailDraft(input: { id: string; clientId: string }) {
  await requireActor();
  const supabase = await getServerSupabase();
  await supabase.from("client_emails").delete().eq("id", input.id).eq("status", "draft");
  revalidatePath(`/clients/${input.clientId}`);
}

/**
 * Called after a stage change: if an active template is wired to the new stage
 * and no draft from it exists yet, create one and nudge the manager.
 */
export async function autoDraftForStage(clientId: string, stageName: string) {
  const supabase = await getServerSupabase();
  const { data: templates } = await supabase
    .from("email_templates")
    .select("*")
    .eq("active", true)
    .eq("trigger", `on_stage:${stageName}`);
  if (!templates?.length) return;

  const { client, lines, manager, stage } = await loadContext(clientId);
  const vars = buildClientVars(client, lines, manager, stage);

  for (const tpl of templates as EmailTemplate[]) {
    const { count } = await supabase
      .from("client_emails")
      .select("id", { count: "exact", head: true })
      .eq("client_id", clientId)
      .eq("template_id", tpl.id);
    if (count && count > 0) continue;

    await supabase.from("client_emails").insert({
      client_id: clientId,
      template_id: tpl.id,
      to_email: client.contact_email,
      subject: renderTemplate(tpl.subject, vars),
      body: renderTemplate(tpl.body, vars),
    });
    await logActivity({
      entity: "client",
      entityId: clientId,
      verb: "email",
      summary: `Auto-drafted "${tpl.name}" for review`,
    });
    if (client.manager_id) {
      await notifyUsers({
        userIds: [client.manager_id],
        event: "stage_change_my_client",
        title: `${client.company_name || client.name}: handover email drafted`,
        body: `Review and send "${tpl.name}".`,
        link: `/clients/${clientId}`,
      });
    }
  }
}
