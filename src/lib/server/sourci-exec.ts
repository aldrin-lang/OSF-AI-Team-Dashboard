import "server-only";
import { getServerSupabase } from "@/lib/supabase/server";
import { getMyAreas } from "@/lib/auth";
import { logActivity } from "@/lib/server/activity";
import { notifyUsers } from "@/lib/server/notify";
import { clientEmailShell, sendEmail } from "@/lib/server/email";
import { LEAD_STATUS, CANDIDATE_STATUS } from "@/lib/labels";
import { dublinDate, isIsoDate, textToHtml } from "@/lib/ops-core";
import type { Area } from "@/lib/areas";
import type { Profile } from "@/lib/types";
import type { SourciProposal } from "@/lib/sourci-types";

/**
 * Runs a change Sourci proposed, AFTER the user pressed/said "yes".
 * Everything is re-validated here and written with the user's own Supabase
 * client, so it can never do more than the user could do in the UI.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

export interface ExecResult {
  ok: boolean;
  message: string; // spoken
  stamp?: string; // CREATED / UPDATED / SENT / NOTIFIED
  title?: string;
  href?: string;
}

export async function executeProposal(p: SourciProposal, me: Profile): Promise<ExecResult> {
  const db = await getServerSupabase();
  const areas = await getMyAreas();
  const need = (a: Area) => {
    if (!areas.includes(a)) throw new Error("That isn't available for your department.");
  };

  switch (p.kind) {
    case "update_lead": {
      need("leads");
      if (!UUID.test(p.leadId)) throw new Error("Bad lead id");
      const { data: before } = await db.from("leads").select("status, setter_id, notes, name").eq("id", p.leadId).maybeSingle();
      if (!before) throw new Error("Lead not found");
      const patch: Record<string, unknown> = {};
      const events: string[] = [];
      if (p.status) {
        if (!(p.status in LEAD_STATUS)) throw new Error("Unknown status");
        if (p.status !== before.status) {
          patch.status = p.status;
          events.push(`Status → ${LEAD_STATUS[p.status as keyof typeof LEAD_STATUS].label}`);
        }
      }
      if (p.setterId !== undefined) {
        if (p.setterId !== null && !UUID.test(p.setterId)) throw new Error("Bad setter id");
        if (p.setterId !== before.setter_id) {
          patch.setter_id = p.setterId;
          patch.assigned_at = p.setterId ? new Date().toISOString() : null;
          patch.assigned_by = `Sourci (${me.full_name || me.email})`;
          events.push(`Setter → ${p.setterName ?? "Unassigned"}`);
        }
      }
      const note = clip(p.note, 2000);
      if (note) {
        patch.notes = [before.notes, `${dublinDate()}: ${note}`].filter(Boolean).join("\n");
        events.push("Note added");
      }
      if (!Object.keys(patch).length) return { ok: true, message: "Nothing needed changing.", stamp: "NO CHANGE", title: before.name as string };
      const { error } = await db.from("leads").update(patch).eq("id", p.leadId);
      if (error) throw new Error(error.message);
      await db.from("lead_events").insert({ lead_id: p.leadId, kind: "note", summary: `Sourci: ${events.join(", ")}`, actor_id: me.id });
      return { ok: true, message: `Done. ${before.name || "The lead"} is updated.`, stamp: "UPDATED", title: before.name as string, href: `/leads/${p.leadId}` };
    }

    case "create_client": {
      need("clients");
      const name = clip(p.name, 200);
      if (!name) throw new Error("Client name is required");
      const pipeline = p.pipeline === "va" ? "va" : "ai";
      const contactEmail = clip(p.contactEmail, 200);
      if (contactEmail && !EMAIL.test(contactEmail)) throw new Error("That email doesn't look right");
      const { data: firstStage } = await db.from("pipeline_stages").select("id").eq("pipeline", pipeline).order("position").limit(1).maybeSingle();
      const remarks = [
        p.contactName ? `Contact: ${clip(p.contactName, 120)}` : null,
        p.phone ? `Phone: ${clip(p.phone, 40)}` : null,
        p.needs ? `Needs: ${clip(p.needs, 1000)}` : null,
        "Created by Sourci",
      ]
        .filter(Boolean)
        .join("\n");
      const { data: client, error } = await db
        .from("clients")
        .insert({
          pipeline,
          name,
          contact_email: contactEmail || null,
          country: clip(p.country, 60) || null,
          source: clip(p.source, 80) || null,
          stage_id: firstStage?.id ?? null,
          remarks,
        })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      const { data: templates } = await db.from("checklist_templates").select("key, label, position").eq("pipeline", pipeline).order("position");
      if (templates?.length) {
        await db.from("checklist_items").insert(templates.map((t) => ({ client_id: client.id, key: t.key, label: t.label, position: t.position })));
      }
      await logActivity({ entity: "client", entityId: client.id, verb: "created", summary: `Created ${name} (via Sourci)` });
      return { ok: true, message: `Profile's created for ${name}.`, stamp: "CREATED", title: name, href: `/clients/${client.id}` };
    }

    case "add_note": {
      need("clients");
      if (!UUID.test(p.clientId)) throw new Error("Bad client id");
      const body = clip(p.body, 4000);
      if (!body) throw new Error("The note is empty");
      const { error } = await db.from("comments").insert({ entity: "client", entity_id: p.clientId, author_id: me.id, body });
      if (error) throw new Error(error.message);
      return { ok: true, message: `Note added to ${p.clientName}.`, stamp: "SAVED", title: p.clientName, href: `/clients/${p.clientId}` };
    }

    case "create_task": {
      const title = clip(p.title, 300);
      if (!title) throw new Error("The task needs a title");
      if (p.clientId && !UUID.test(p.clientId)) throw new Error("Bad client id");
      if (p.assigneeId && !UUID.test(p.assigneeId)) throw new Error("Bad assignee");
      if (p.dueDate && !isIsoDate(p.dueDate)) throw new Error("Bad due date");
      if (p.clientId) need("clients");
      const { error } = await db.from("tasks").insert({
        title,
        client_id: p.clientId ?? null,
        assignee_id: p.assigneeId ?? me.id,
        due_date: p.dueDate ?? null,
        created_by: me.id,
      });
      if (error) throw new Error(error.message);
      if (p.assigneeId && p.assigneeId !== me.id) {
        await notifyUsers({
          userIds: [p.assigneeId],
          event: "assigned_to_me",
          title: `New task: ${title}`,
          body: [p.clientName, p.dueDate ? `Due ${p.dueDate}` : null].filter(Boolean).join(" · ") || undefined,
          link: p.clientId ? `/clients/${p.clientId}` : "/my-desk",
        });
      }
      return { ok: true, message: `Task added${p.assigneeName ? ` for ${p.assigneeName}` : ""}.`, stamp: "ADDED", title, href: p.clientId ? `/clients/${p.clientId}` : "/my-desk" };
    }

    case "invoice_status": {
      need("payments");
      if (me.role === "member") throw new Error("Only managers can change invoices.");
      if (!UUID.test(p.invoiceId)) throw new Error("Bad invoice id");
      if (p.status !== "paid" && p.status !== "void") throw new Error("Unknown invoice status");
      const { data: inv, error } = await db
        .from("invoices")
        .update({ status: p.status, paid_on: p.status === "paid" ? dublinDate() : null })
        .eq("id", p.invoiceId)
        .select("client_id, number")
        .single();
      if (error) throw new Error(error.message);
      await db.from("payment_reminders").update({ status: "skipped" }).eq("invoice_id", p.invoiceId).eq("status", "draft");
      await logActivity({ entity: "client", entityId: inv.client_id as string, verb: "updated", summary: `Invoice ${inv.number} marked ${p.status} (via Sourci)` });
      return { ok: true, message: `Invoice ${inv.number} is marked ${p.status}.`, stamp: p.status === "paid" ? "PAID" : "VOID", title: `Invoice ${inv.number}`, href: `/payments/${p.invoiceId}` };
    }

    case "candidate_status": {
      need("candidates");
      if (!UUID.test(p.candidateId)) throw new Error("Bad candidate id");
      if (!(p.status in CANDIDATE_STATUS)) throw new Error("Unknown candidate status");
      const { error } = await db.from("candidates").update({ status: p.status }).eq("id", p.candidateId);
      if (error) throw new Error(error.message);
      return { ok: true, message: `${p.name} is now ${CANDIDATE_STATUS[p.status as keyof typeof CANDIDATE_STATUS].label.toLowerCase()}.`, stamp: "UPDATED", title: p.name, href: `/candidates/${p.candidateId}` };
    }

    case "send_email": {
      const to = clip(p.to, 200);
      const subject = clip(p.subject, 200);
      const body = clip(p.body, 8000);
      if (!EMAIL.test(to)) throw new Error("That email address doesn't look right");
      if (!subject || !body) throw new Error("The email needs a subject and a message");
      const res = await sendEmail({ to, subject, html: clientEmailShell(textToHtml(body)), text: body });
      if (res.skipped) throw new Error("Email sending isn't set up on the server.");
      if (!res.ok) throw new Error("The email provider rejected the message.");
      if (p.clientId && UUID.test(p.clientId)) {
        await db.from("client_emails").insert({
          client_id: p.clientId,
          to_email: to,
          subject,
          body,
          status: "sent",
          created_by: me.id,
          sent_by: me.id,
          sent_at: new Date().toISOString(),
        });
      }
      return { ok: true, message: `Sent to ${to}.`, stamp: "SENT", title: subject, href: p.clientId ? `/clients/${p.clientId}` : undefined };
    }

    case "bulk_update_leads": {
      need("leads");
      const ids = (p.leadIds ?? []).filter((x) => UUID.test(x)).slice(0, 100);
      if (!ids.length) throw new Error("No leads to change");
      const patch: Record<string, unknown> = {};
      const parts: string[] = [];
      if (p.setterId !== undefined) {
        if (p.setterId !== null && !UUID.test(p.setterId)) throw new Error("Bad setter id");
        patch.setter_id = p.setterId;
        patch.assigned_at = p.setterId ? new Date().toISOString() : null;
        patch.assigned_by = `Sourci (${me.full_name || me.email})`;
        parts.push(`Setter → ${p.setterName ?? "Unassigned"}`);
      }
      if (p.status) {
        if (!(p.status in LEAD_STATUS)) throw new Error("Unknown status");
        patch.status = p.status;
        parts.push(`Status → ${LEAD_STATUS[p.status as keyof typeof LEAD_STATUS].label}`);
      }
      if (!parts.length) throw new Error("Nothing to change");
      const { data: changed, error } = await db.from("leads").update(patch).in("id", ids).select("id");
      if (error) throw new Error(error.message);
      const n = changed?.length ?? 0;
      if (n) {
        await db.from("lead_events").insert((changed ?? []).map((l) => ({ lead_id: l.id, kind: "note", summary: `Sourci: ${parts.join(", ")}`, actor_id: me.id })));
      }
      if (p.setterId) {
        const { data: setter } = await db.from("setters").select("profile_id").eq("id", p.setterId).maybeSingle();
        if (setter?.profile_id) {
          await notifyUsers({ userIds: [setter.profile_id as string], event: "assigned_to_me", title: `${n} lead${n === 1 ? "" : "s"} assigned to you`, body: `By ${me.full_name || me.email} via Sourci`, link: "/leads" });
        }
      }
      return { ok: true, message: `Done. ${n} lead${n === 1 ? "" : "s"} updated${p.setterName ? `, now with ${p.setterName}` : ""}.`, stamp: "UPDATED", title: `${n} leads`, href: "/leads" };
    }

    case "notify_team": {
      const title = clip(p.title, 200);
      if (!title) throw new Error("The reminder is empty");
      const ids = (p.recipientIds ?? []).filter((x) => UUID.test(x)).slice(0, 200);
      if (!ids.length) throw new Error("Nobody to notify");
      await notifyUsers({ userIds: ids, event: "team_reminder", title, body: clip(p.body, 1000) || `Sent by Sourci for ${me.full_name || me.email}`, link: "/notifications" });
      return { ok: true, message: `Done. ${ids.length} ${ids.length === 1 ? "person has" : "people have"} been reminded.`, stamp: "NOTIFIED", title };
    }
  }
  return { ok: false, message: "I don't know how to do that yet." };
}
