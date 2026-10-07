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
import { BULK_MAX, ENTITIES, type EntityKey } from "@/lib/server/sourci-records";
import { screenCandidate } from "@/lib/server/candidates";
import { formatMoney } from "@/lib/ops-core";
import { moveClientStage } from "@/app/(app)/clients/actions";
import { sendReminder } from "@/lib/server/payments";
import { sendCheckinEmail } from "@/lib/server/checkins";
import { CURRENCIES } from "@/lib/ops-core";
import { createSheetFrom } from "@/lib/server/sheets";
import { fitScore, hireCandidate } from "@/lib/server/staffing";
import type { Candidate } from "@/lib/types";

/**
 * Runs a change Donna proposed, AFTER the user pressed/said "yes".
 * Everything is re-validated here and written with the user's own Supabase
 * client, so it can never do more than the user could do in the UI.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clip = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

type Db = Awaited<ReturnType<typeof getServerSupabase>>;
type Val = string | number | boolean | null;
type Change = { field: string; value: Val; display: string };

const chunks = <T,>(xs: T[], n: number): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/** Columns a restore (undo) may write back for an entity: its editable columns + their side-effect columns. */
function restorableCols(entity: EntityKey): Set<string> {
  const cols = new Set(Object.values(ENTITIES[entity].editable).map((d) => d.col));
  for (const c of ["assigned_at", "assigned_by", "resolved_at", "paid_on"]) cols.add(c);
  return cols;
}

/**
 * Apply validated field changes to many records of one type, the same way the
 * screens do (side effects, notes appended, timeline logging, notifications).
 * Returns what changed plus a snapshot of the old values so it can be undone.
 */
async function applyBulk(db: Db, me: Profile, entity: EntityKey, idsIn: string[], changes: Change[]): Promise<{ changed: string[]; said: string[]; before: { id: string; values: Record<string, Val> }[] }> {
  const ent = ENTITIES[entity];
  const ids = idsIn.filter((x) => UUID.test(x)).slice(0, BULK_MAX);
  if (!ids.length) throw new Error("Nothing to change");
  const patch: Record<string, unknown> = {};
  const appends: { col: string; text: string }[] = [];
  const said: string[] = [];
  for (const c of changes ?? []) {
    const def = ent.editable[c.field];
    if (!def) throw new Error(`Can't change ${c.field}`);
    if (def.managerOnly && me.role === "member") throw new Error("Only managers can change that.");
    const v = c.value;
    if (def.kind === "enum" && !(typeof v === "string" && def.values?.includes(v))) throw new Error(`Bad value for ${c.field}`);
    if ((def.kind === "person" || def.kind === "setter") && !(v === null || (typeof v === "string" && UUID.test(v)))) throw new Error(`Bad value for ${c.field}`);
    if (def.kind === "date" && !(typeof v === "string" && isIsoDate(v))) throw new Error(`Bad date for ${c.field}`);
    if (def.kind === "number" && !(typeof v === "number" && (def.min == null || v >= def.min) && (def.max == null || v <= def.max))) throw new Error(`Bad number for ${c.field}`);
    if (def.kind === "bool" && typeof v !== "boolean") throw new Error(`Bad value for ${c.field}`);
    if (def.kind === "text" && !def.append && !(typeof v === "string" && v.trim())) throw new Error(`${c.field} can't be empty`);
    if (def.append) appends.push({ col: def.col, text: clip(v, 2000) });
    else patch[def.col] = typeof v === "string" ? v.slice(0, 2000) : v;
    said.push(`${c.field.replace(/_/g, " ")} → ${c.display}`);
    // side effects that keep the record consistent, same as the buttons do
    if (entity === "leads" && c.field === "setter") {
      patch.assigned_at = v ? new Date().toISOString() : null;
      patch.assigned_by = `Donna (${me.full_name || me.email})`;
    }
    if (entity === "concerns" && c.field === "status") patch.resolved_at = v === "resolved" ? new Date().toISOString() : null;
    if (entity === "invoices" && c.field === "status") patch.paid_on = v === "paid" ? dublinDate() : null;
  }

  // snapshot for undo
  const snapCols = [...new Set([...Object.keys(patch), ...appends.map((a) => a.col)])];
  const before: { id: string; values: Record<string, Val> }[] = [];
  for (const part of chunks(ids, 150)) {
    const { data } = await db.from(ent.table).select(["id", ...snapCols].join(", ")).in("id", part);
    for (const r of (data ?? []) as unknown as Record<string, Val>[]) {
      const { id, ...values } = r;
      before.push({ id: id as string, values });
    }
  }

  let changed: string[] = before.map((b) => b.id);
  if (Object.keys(patch).length) {
    changed = [];
    for (const part of chunks(ids, 150)) {
      const { data, error } = await db.from(ent.table).update(patch).in("id", part).select("id");
      if (error) throw new Error(error.message);
      changed.push(...(data ?? []).map((r) => r.id as string));
    }
  }
  for (const a of appends) {
    for (const b of before.filter((x) => changed.includes(x.id))) {
      const prev = (b.values[a.col] as string | null) ?? "";
      await db.from(ent.table).update({ [a.col]: [prev, `${dublinDate()}: ${a.text}`].filter(Boolean).join("\n") }).eq("id", b.id);
    }
  }
  if (entity === "invoices" && patch.status && patch.status !== "open") {
    for (const part of chunks(changed, 150)) await db.from("payment_reminders").update({ status: "skipped" }).in("invoice_id", part).eq("status", "draft");
  }

  // timeline / notifications
  const summary = `Donna: ${said.join(", ")}`;
  if (ent.logAs === "lead" && changed.length) {
    for (const part of chunks(changed, 200)) await db.from("lead_events").insert(part.map((id) => ({ lead_id: id, kind: "note", summary, actor_id: me.id })));
  } else if (ent.logAs === "client" || ent.logAs === "concern") {
    let entityIds = changed;
    if (ent.clientCol) {
      entityIds = [];
      for (const part of chunks(changed, 150)) entityIds.push(...((await db.from(ent.table).select(ent.clientCol).in("id", part)).data ?? []).map((r) => (r as unknown as Record<string, string>)[ent.clientCol!]));
    }
    for (const id of [...new Set(entityIds)].slice(0, 100)) {
      await logActivity({ entity: ent.logAs === "concern" ? "concern" : "client", entityId: id, verb: "updated", summary }).catch(() => {});
    }
  }
  if (entity === "leads") {
    const setterChange = changes.find((c) => c.field === "setter" && c.value);
    if (setterChange) {
      const { data: setter } = await db.from("setters").select("profile_id").eq("id", setterChange.value as string).maybeSingle();
      if (setter?.profile_id) await notifyUsers({ userIds: [setter.profile_id as string], event: "assigned_to_me", title: `${changed.length} lead${changed.length === 1 ? "" : "s"} assigned to you`, body: `By ${me.full_name || me.email} via Donna`, link: "/leads" });
    }
  }
  const personField = { tasks: "assignee", concerns: "owner", clients: "manager", roles: "recruiter" }[entity as string];
  if (personField) {
    const a = changes.find((c) => c.field === personField && c.value && c.value !== me.id);
    if (a) await notifyUsers({ userIds: [a.value as string], event: "assigned_to_me", title: `${changed.length} ${changed.length === 1 ? ent.label.replace(/s$/, "") : ent.label} now yours`, body: `By ${me.full_name || me.email} via Donna`, link: entity === "tasks" ? "/my-desk" : entity === "roles" ? "/roles" : "/" });
  }
  return { changed, said, before: before.filter((b) => changed.includes(b.id)) };
}

const undoFor = (entity: EntityKey, label: string, before: { id: string; values: Record<string, Val> }[]): SourciProposal | undefined =>
  before.length ? { kind: "restore", entity, label, rows: before } : undefined;

/** Personalise a bulk email: {first_name}, {name}. */
function fill(t: string, name: string): string {
  const first = name.trim().split(/\s+/)[0] || "there";
  return t.replace(/\{first_?name\}/gi, first).replace(/\{name\}/gi, name || "there");
}

export interface ExecResult {
  ok: boolean;
  message: string; // spoken
  stamp?: string; // CREATED / UPDATED / SENT / NOTIFIED
  title?: string;
  href?: string;
  undo?: SourciProposal; // lets the user say "undo" / press Undo
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
          patch.assigned_by = `Donna (${me.full_name || me.email})`;
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
      await db.from("lead_events").insert({ lead_id: p.leadId, kind: "note", summary: `Donna: ${events.join(", ")}`, actor_id: me.id });
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
        "Created by Donna",
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
      await logActivity({ entity: "client", entityId: client.id, verb: "created", summary: `Created ${name} (via Donna)` });
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
      await logActivity({ entity: "client", entityId: inv.client_id as string, verb: "updated", summary: `Invoice ${inv.number} marked ${p.status} (via Donna)` });
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
        patch.assigned_by = `Donna (${me.full_name || me.email})`;
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
        await db.from("lead_events").insert((changed ?? []).map((l) => ({ lead_id: l.id, kind: "note", summary: `Donna: ${parts.join(", ")}`, actor_id: me.id })));
      }
      if (p.setterId) {
        const { data: setter } = await db.from("setters").select("profile_id").eq("id", p.setterId).maybeSingle();
        if (setter?.profile_id) {
          await notifyUsers({ userIds: [setter.profile_id as string], event: "assigned_to_me", title: `${n} lead${n === 1 ? "" : "s"} assigned to you`, body: `By ${me.full_name || me.email} via Donna`, link: "/leads" });
        }
      }
      return { ok: true, message: `Done. ${n} lead${n === 1 ? "" : "s"} updated${p.setterName ? `, now with ${p.setterName}` : ""}.`, stamp: "UPDATED", title: `${n} leads`, href: "/leads" };
    }

    case "bulk_update": {
      const ent = ENTITIES[p.entity as EntityKey];
      if (!ent) throw new Error("Unknown record type");
      if (ent.area) need(ent.area);
      const r = await applyBulk(db, me, p.entity as EntityKey, p.ids ?? [], p.changes ?? []);
      const n = r.changed.length;
      const label = `${n} ${n === 1 ? ent.label.replace(/s$/, "") : ent.label}`;
      return { ok: true, message: `Done. ${label} updated. Say "undo" if that wasn't right.`, stamp: "UPDATED", title: label, href: p.entity === "leads" ? "/leads" : undefined, undo: undoFor(p.entity as EntityKey, label, r.before) };
    }

    case "distribute": {
      const entity = p.entity as EntityKey;
      const ent = ENTITIES[entity];
      if (!ent) throw new Error("Unknown record type");
      if (ent.area) need(ent.area);
      const def = ent.editable[p.field];
      if (!def || (def.kind !== "person" && def.kind !== "setter")) throw new Error("Can only share out people fields");
      const before: { id: string; values: Record<string, Val> }[] = [];
      const parts: string[] = [];
      for (const g of (p.groups ?? []).slice(0, 20)) {
        if (!UUID.test(g.value)) throw new Error("Bad person");
        const r = await applyBulk(db, me, entity, g.ids ?? [], [{ field: p.field, value: g.value, display: g.display }]);
        before.push(...r.before);
        parts.push(`${r.changed.length} to ${clip(g.display, 60)}`);
      }
      const label = `${before.length} ${ent.label}`;
      return { ok: true, message: `Shared out: ${parts.join(", ")}.`, stamp: "ASSIGNED", title: label, href: entity === "leads" ? "/leads" : undefined, undo: undoFor(entity, label, before) };
    }

    case "restore": {
      const entity = p.entity as EntityKey;
      const ent = ENTITIES[entity];
      if (!ent) throw new Error("Unknown record type");
      if (ent.area) need(ent.area);
      const allowed = restorableCols(entity);
      const managerCols = new Set(Object.values(ent.editable).filter((d) => d.managerOnly).map((d) => d.col));
      // group identical old values so it's a few updates, not one per row
      const groups = new Map<string, string[]>();
      for (const row of (p.rows ?? []).slice(0, BULK_MAX)) {
        if (!UUID.test(row.id)) continue;
        const vals = Object.fromEntries(Object.entries(row.values ?? {}).filter(([k]) => allowed.has(k)));
        if (me.role === "member" && Object.keys(vals).some((k) => managerCols.has(k))) throw new Error("Only managers can undo that.");
        const key = JSON.stringify(vals);
        groups.set(key, [...(groups.get(key) ?? []), row.id]);
      }
      let n = 0;
      for (const [key, ids] of groups) {
        const vals = JSON.parse(key) as Record<string, Val>;
        if (!Object.keys(vals).length) continue;
        for (const part of chunks(ids, 150)) {
          const { data, error } = await db.from(ent.table).update(vals).in("id", part).select("id");
          if (error) throw new Error(error.message);
          n += data?.length ?? 0;
        }
      }
      return { ok: n > 0, message: n ? `Undone. ${clip(p.label, 80)} put back how they were.` : "Nothing to undo.", stamp: "UNDONE", title: clip(p.label, 80) };
    }

    case "bulk_tasks": {
      const items = (p.items ?? []).slice(0, 200);
      if (!items.length) throw new Error("No tasks to add");
      if (p.dueDate && !isIsoDate(p.dueDate)) throw new Error("Bad due date");
      if (items.some((i) => i.clientId)) need("clients");
      const rows = items.map((i) => {
        if (!UUID.test(i.assigneeId) || (i.clientId && !UUID.test(i.clientId))) throw new Error("Bad task");
        const title = clip(i.title, 300);
        if (!title) throw new Error("A task needs a title");
        return { title, client_id: i.clientId ?? null, assignee_id: i.assigneeId, due_date: p.dueDate ?? null, created_by: me.id };
      });
      const { error } = await db.from("tasks").insert(rows);
      if (error) throw new Error(error.message);
      const per = new Map<string, number>();
      for (const r of rows) if (r.assignee_id !== me.id) per.set(r.assignee_id, (per.get(r.assignee_id) ?? 0) + 1);
      for (const [uid, k] of per) {
        await notifyUsers({ userIds: [uid], event: "assigned_to_me", title: `${k} new task${k === 1 ? "" : "s"} for you`, body: `${rows[0].title}${k > 1 ? " and more" : ""} · from ${me.full_name || me.email} via Donna`, link: "/my-desk" });
      }
      return { ok: true, message: `${rows.length} task${rows.length === 1 ? "" : "s"} added${per.size ? ` and ${per.size} ${per.size === 1 ? "person" : "people"} notified` : ""}.`, stamp: "ADDED", title: `${rows.length} tasks`, href: "/my-desk" };
    }

    case "bulk_email": {
      const subject = clip(p.subject, 200);
      const body = clip(p.body, 8000);
      if (!subject || !body) throw new Error("The email needs a subject and a message");
      const area = ENTITIES[p.entity as EntityKey]?.area;
      if (area) need(area);
      let sent = 0;
      const failed: string[] = [];
      for (const it of (p.items ?? []).slice(0, 50)) {
        const to = clip(it.to, 200);
        if (!EMAIL.test(to)) {
          failed.push(`${it.name}: bad address`);
          continue;
        }
        const text = fill(body, clip(it.name, 120));
        const res = await sendEmail({ to, subject: fill(subject, clip(it.name, 120)), html: clientEmailShell(textToHtml(text)), text });
        if (res.skipped) throw new Error("Email sending isn't set up on the server.");
        if (!res.ok) {
          failed.push(`${it.name}: rejected`);
          continue;
        }
        sent++;
        if (it.clientId && UUID.test(it.clientId)) {
          await db.from("client_emails").insert({ client_id: it.clientId, to_email: to, subject, body: text, status: "sent", created_by: me.id, sent_by: me.id, sent_at: new Date().toISOString() });
        }
      }
      return { ok: sent > 0, message: `${sent} email${sent === 1 ? "" : "s"} sent.${failed.length ? ` ${failed.length} didn't go (${failed.slice(0, 2).join("; ")}).` : ""}`, stamp: "SENT", title: subject };
    }

    case "bulk_invoices": {
      need("payments");
      if (me.role === "member") throw new Error("Only managers can add invoices.");
      if (!(CURRENCIES as readonly string[]).includes(p.currency)) throw new Error("Unknown currency");
      if (!isIsoDate(p.dueOn)) throw new Error("Bad due date");
      const issued = dublinDate();
      const items = (p.items ?? []).slice(0, 200);
      let made = 0;
      let total = 0;
      const failed: string[] = [];
      for (const it of items) {
        const amount = Math.round(Number(it.amount) * 100) / 100;
        if (!UUID.test(it.clientId) || !(amount > 0)) {
          failed.push(`${it.clientName}: bad amount`);
          continue;
        }
        const number = clip(it.number, 60);
        const { error } = await db.from("invoices").insert({ client_id: it.clientId, number, amount, currency: p.currency, issued_on: p.dueOn < issued ? p.dueOn : issued, due_on: p.dueOn, description: clip(p.description, 500) || null, created_by: me.id });
        if (error) {
          failed.push(`${it.clientName}: ${error.code === "23505" ? "number already used" : "failed"}`);
          continue;
        }
        made++;
        total += amount;
        await logActivity({ entity: "client", entityId: it.clientId, verb: "updated", summary: `Invoice ${number} added (via Donna)` }).catch(() => {});
      }
      return { ok: made > 0, message: `${made} invoice${made === 1 ? "" : "s"} added, ${formatMoney(total, p.currency)} in total, due ${p.dueOn}.${failed.length ? ` ${failed.length} skipped (${failed.slice(0, 2).join("; ")}).` : ""}`, stamp: "CREATED", title: `${made} invoices`, href: "/payments" };
    }

    case "bulk_convert": {
      need("leads");
      need("clients");
      let n = 0;
      const skipped: string[] = [];
      for (const id of (p.leadIds ?? []).filter((x) => UUID.test(x)).slice(0, 25)) {
        try {
          const r = await executeProposal({ kind: "convert_lead", leadId: id, leadName: "" }, me);
          if (r.stamp === "CONVERTED") n++;
        } catch (e) {
          skipped.push(e instanceof Error ? e.message : "failed");
        }
      }
      return { ok: n > 0, message: `${n} lead${n === 1 ? "" : "s"} turned into clients at the first onboarding stage.${skipped.length ? ` ${skipped.length} skipped.` : ""}`, stamp: "CONVERTED", title: `${n} new clients`, href: "/pipeline" };
    }

    case "bulk_rescreen": {
      need("candidates");
      let ok = 0;
      for (const id of (p.candidateIds ?? []).filter((x) => UUID.test(x)).slice(0, 20)) {
        const r = await screenCandidate(id);
        if (r.ok) ok++;
      }
      return { ok: ok > 0, message: `${ok} candidate${ok === 1 ? "" : "s"} re-screened.`, stamp: "SCREENED", title: `${ok} candidates`, href: "/candidates" };
    }

    case "notifications_read": {
      const { data, error } = await db.from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", me.id).is("read_at", null).select("id");
      if (error) throw new Error(error.message);
      return { ok: true, message: `${data?.length ?? 0} notification${data?.length === 1 ? "" : "s"} marked read.`, stamp: "CLEARED", title: "Notifications", href: "/notifications" };
    }

    case "move_stage": {
      need("clients");
      if (!UUID.test(p.stageId)) throw new Error("Bad stage");
      const ids = (p.clientIds ?? []).filter((x) => UUID.test(x)).slice(0, 50);
      const blocked: string[] = [];
      let moved = 0;
      for (const id of ids) {
        const r = await moveClientStage({ clientId: id, toStageId: p.stageId });
        if (r.ok) moved++;
        else {
          const { data: c } = await db.from("clients").select("name").eq("id", id).maybeSingle();
          blocked.push(`${c?.name ?? "a client"} (${r.error})`);
        }
      }
      const msg = `${moved} moved to ${p.stageName}.${blocked.length ? ` ${blocked.length} blocked: ${blocked.slice(0, 3).join("; ")}` : ""}`;
      return { ok: moved > 0, message: msg, stamp: moved ? "MOVED" : "BLOCKED", title: `Stage: ${p.stageName}`, href: ids.length === 1 ? `/clients/${ids[0]}` : "/pipeline" };
    }

    case "convert_lead": {
      need("leads");
      need("clients");
      if (!UUID.test(p.leadId)) throw new Error("Bad lead id");
      const { data: lead } = await db.from("leads").select("*").eq("id", p.leadId).maybeSingle();
      if (!lead) throw new Error("Lead not found");
      if (lead.client_id) return { ok: true, message: `${lead.name} is already a client.`, stamp: "ALREADY", title: lead.name as string, href: `/clients/${lead.client_id}` };
      if (lead.service === "unknown") throw new Error(`Set whether ${lead.name} is AI or VA first`);
      const pipe = lead.service === "va" || lead.service === "premium" ? "va" : "ai";
      const { data: firstStage } = await db.from("pipeline_stages").select("id").eq("pipeline", pipe).order("position").limit(1).maybeSingle();
      let closedBy: string | null = null;
      if (lead.setter_id) closedBy = ((await db.from("setters").select("name").eq("id", lead.setter_id).maybeSingle()).data?.name as string) ?? null;
      const name = (lead.name as string) || (lead.email as string) || "New client";
      const { data: client, error } = await db
        .from("clients")
        .insert({ pipeline: pipe, name, contact_email: lead.email, source: lead.source, country: lead.country, closed_by: closedBy, stage_id: firstStage?.id ?? null })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      const { data: templates } = await db.from("checklist_templates").select("key, label, position").eq("pipeline", pipe).order("position");
      if (templates?.length) await db.from("checklist_items").insert(templates.map((t) => ({ client_id: client.id, key: t.key, label: t.label, position: t.position })));
      await db.from("leads").update({ client_id: client.id, status: "won" }).eq("id", p.leadId);
      await db.from("lead_events").insert({ lead_id: p.leadId, kind: "converted", summary: `Converted to ${pipe === "va" ? "a VA outsourcing" : "an AI receptionist"} client (via Donna)`, actor_id: me.id });
      await logActivity({ entity: "client", entityId: client.id, verb: "created", summary: `Created ${name} from a lead (via Donna)` });
      return { ok: true, message: `${name} is now a ${pipe === "va" ? "VA" : "AI receptionist"} client, at the first stage.`, stamp: "CONVERTED", title: name, href: `/clients/${client.id}` };
    }

    case "create_invoice": {
      need("payments");
      if (me.role === "member") throw new Error("Only managers can add invoices.");
      if (!UUID.test(p.clientId)) throw new Error("Bad client");
      const amount = Math.round(Number(p.amount) * 100) / 100;
      if (!(amount > 0)) throw new Error("Amount must be more than 0");
      if (!(CURRENCIES as readonly string[]).includes(p.currency)) throw new Error("Unknown currency");
      if (!isIsoDate(p.dueOn)) throw new Error("Bad due date");
      const number = clip(p.number, 60);
      if (!number) throw new Error("Invoice number is required");
      const billTo = clip(p.billTo, 200);
      if (billTo && !EMAIL.test(billTo)) throw new Error("Billing email doesn't look right");
      const issued = dublinDate();
      const { data, error } = await db
        .from("invoices")
        .insert({ client_id: p.clientId, number, amount, currency: p.currency, issued_on: p.dueOn < issued ? p.dueOn : issued, due_on: p.dueOn, description: clip(p.description, 500) || null, bill_to_email: billTo || null, created_by: me.id })
        .select("id")
        .single();
      if (error) throw new Error(error.code === "23505" ? `Invoice ${number} already exists` : error.message);
      await logActivity({ entity: "client", entityId: p.clientId, verb: "updated", summary: `Invoice ${number} added (via Donna)` });
      return { ok: true, message: `Invoice ${number} added for ${p.clientName}. Reminders will go out automatically from three days before it's due.`, stamp: "CREATED", title: `Invoice ${number}`, href: `/payments/${data.id}` };
    }

    case "create_concern": {
      need("clients");
      if (!UUID.test(p.clientId)) throw new Error("Bad client");
      const title = clip(p.title, 200);
      if (!title) throw new Error("The concern needs a title");
      const severity = ["low", "medium", "high", "urgent"].includes(p.severity) ? p.severity : "medium";
      if (p.ownerId && !UUID.test(p.ownerId)) throw new Error("Bad owner");
      const { data, error } = await db
        .from("concerns")
        .insert({ client_id: p.clientId, title, severity, description: clip(p.description, 4000) || null, raised_by: me.id, owner_id: p.ownerId ?? null })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      await logActivity({ entity: "concern", entityId: data.id, verb: "created", summary: `Concern raised for ${p.clientName}: ${title} (via Donna)` });
      if (p.ownerId && p.ownerId !== me.id) await notifyUsers({ userIds: [p.ownerId], event: "concern_my_client", title: `New concern: ${p.clientName}`, body: title, link: `/concerns/${data.id}` });
      return { ok: true, message: `Concern logged for ${p.clientName}.`, stamp: "RAISED", title, href: `/concerns/${data.id}` };
    }

    case "send_reminders": {
      need("payments");
      if (me.role === "member") throw new Error("Only managers can send payment reminders.");
      const ids = (p.reminderIds ?? []).filter((x) => UUID.test(x)).slice(0, 25);
      let sent = 0;
      const failed: string[] = [];
      for (const id of ids) {
        const { data: r } = await db.from("payment_reminders").select("subject, body, status").eq("id", id).maybeSingle();
        if (!r || r.status !== "draft") continue;
        const res = await sendReminder(id, me.id, { subject: r.subject as string, body: r.body as string });
        if (res.ok) sent++;
        else failed.push(res.error ?? "failed");
      }
      return { ok: sent > 0, message: `${sent} reminder${sent === 1 ? "" : "s"} sent.${failed.length ? ` ${failed.length} couldn't go: ${failed[0]}` : ""}`, stamp: "SENT", title: "Payment reminders", href: "/payments" };
    }

    case "send_checkins": {
      need("checkins");
      const ids = (p.checkinIds ?? []).filter((x) => UUID.test(x)).slice(0, 25);
      let sent = 0;
      const failed: string[] = [];
      for (const id of ids) {
        const { data: c } = await db.from("checkins").select("subject, message, status").eq("id", id).maybeSingle();
        if (!c || c.status !== "due") continue;
        const res = await sendCheckinEmail(id, me.id, { subject: (c.subject as string) ?? "Checking in", message: (c.message as string) ?? "", to: null });
        if (res.ok) sent++;
        else failed.push(res.error ?? "failed");
      }
      return { ok: sent > 0, message: `${sent} check-in${sent === 1 ? "" : "s"} sent.${failed.length ? ` ${failed.length} couldn't go: ${failed[0]}` : ""}`, stamp: "SENT", title: "Check-ins", href: "/check-ins?view=waiting" };
    }

    case "add_sheet_row": {
      if (!UUID.test(p.sheetId)) throw new Error("Bad sheet id");
      const { data: cols } = await db.from("sheet_columns").select("id").eq("sheet_id", p.sheetId);
      const valid = new Set((cols ?? []).map((c) => c.id as string));
      const clean = (cells: Record<string, Val>) =>
        Object.fromEntries(
          Object.entries(cells ?? {})
            .filter(([k, v]) => valid.has(k) && (v === null || ["string", "number", "boolean"].includes(typeof v)))
            .map(([k, v]) => [k, typeof v === "string" ? v.slice(0, 5000) : v]),
        );
      const all = (p.rows?.length ? p.rows : p.cells ? [p.cells] : []).slice(0, 100).map(clean).filter((c) => Object.keys(c).length);
      if (!all.length) throw new Error("Nothing to add");
      const { data: last } = await db.from("sheet_rows").select("position").eq("sheet_id", p.sheetId).order("position", { ascending: false }).limit(1).maybeSingle();
      const base = (last?.position as number) ?? 0;
      const { error } = await db.from("sheet_rows").insert(all.map((cells, i) => ({ sheet_id: p.sheetId, cells, position: base + i + 1, created_by: me.id })));
      if (error) throw new Error(error.message.includes("row-level security") ? "You don't have access to that sheet." : error.message);
      return { ok: true, message: all.length === 1 ? `Logged in ${p.sheetName}.` : `${all.length} rows added to ${p.sheetName}.`, stamp: "ADDED", title: p.sheetName, href: `/sheets/${p.sheetId}` };
    }

    case "create_sheet": {
      const id = await createSheetFrom(clip(p.template, 40), clip(p.name, 120), me.id, { visibility: p.visibility === "everyone" ? "everyone" : "private" });
      return { ok: true, message: `Your ${clip(p.name, 120)} sheet is ready.`, stamp: "CREATED", title: clip(p.name, 120), href: `/sheets/${id}` };
    }

    case "create_role": {
      need("candidates");
      if (!UUID.test(p.clientId)) throw new Error("Bad client id");
      const title = clip(p.title, 120);
      if (!title) throw new Error("The role needs a title");
      if (p.startBy && !isIsoDate(p.startBy)) throw new Error("Bad start date");
      const { data, error } = await db
        .from("va_roles")
        .insert({
          client_id: p.clientId,
          title,
          headcount: Math.max(1, Math.min(50, Math.round(Number(p.headcount) || 1))),
          employment_type: ["full_time", "part_time", "project"].includes(p.employmentType) ? p.employmentType : "full_time",
          start_by: p.startBy ?? null,
          priority: ["low", "normal", "high", "urgent"].includes(p.priority) ? p.priority : "normal",
          requirements: clip(p.requirements, 4000) || null,
          owner_id: me.id,
          created_by: me.id,
        })
        .select("id")
        .single();
      if (error || !data) throw new Error(error?.message ?? "Couldn't open the role");
      return { ok: true, message: `Role opened for ${p.clientName}. I can find matches whenever you're ready.`, stamp: "CREATED", title: `${title} · ${p.clientName}`, href: `/roles/${data.id}` };
    }

    case "shortlist": {
      need("candidates");
      if (!UUID.test(p.roleId)) throw new Error("Bad role id");
      const ids = (p.candidateIds ?? []).filter((x) => UUID.test(x)).slice(0, 10);
      const { data: role } = await db.from("va_roles").select("title, status").eq("id", p.roleId).single();
      if (!role) throw new Error("Role not found");
      const { data: cands } = await db.from("candidates").select("*").in("id", ids);
      const list = (cands as Candidate[]) ?? [];
      if (!list.length) throw new Error("No candidates found");
      const { error } = await db.from("va_role_candidates").upsert(
        list.map((c) => ({ role_id: p.roleId, candidate_id: c.id, stage: "shortlisted", match_score: fitScore(c, role.title), added_by: me.id })),
        { onConflict: "role_id,candidate_id" },
      );
      if (error) throw new Error(error.message);
      await db.from("candidates").update({ status: "shortlisted" }).in("id", list.filter((c) => c.status === "new" || c.status === "screened").map((c) => c.id));
      if (role.status === "open") await db.from("va_roles").update({ status: "sourcing" }).eq("id", p.roleId);
      return { ok: true, message: `${list.length === 1 ? list[0].full_name.split(" ")[0] + " is" : `${list.length} candidates are`} on the shortlist.`, stamp: "UPDATED", title: `Shortlist · ${role.title}`, href: `/roles/${p.roleId}` };
    }

    case "hire": {
      need("candidates");
      if (!UUID.test(p.roleCandidateId) || !UUID.test(p.roleId)) throw new Error("Bad id");
      if (p.startDate && !isIsoDate(p.startDate)) throw new Error("Bad start date");
      const r = await hireCandidate(
        {
          roleCandidateId: p.roleCandidateId,
          startDate: p.startDate ?? null,
          hourlyRate: typeof p.hourlyRate === "number" && p.hourlyRate >= 0 ? p.hourlyRate : null,
          currency: ["USD", "GBP", "EUR", "PHP", "AUD", "NZD", "CAD"].includes(p.currency) ? p.currency : "USD",
          hoursPerWeek: null,
        },
        me,
      );
      if (!r.ok) throw new Error(r.message);
      return { ok: true, message: r.message, stamp: "HIRED", title: `${p.name} · ${p.clientName}`, href: "/vas" };
    }

    case "notify_team": {
      const title = clip(p.title, 200);
      if (!title) throw new Error("The reminder is empty");
      const ids = (p.recipientIds ?? []).filter((x) => UUID.test(x)).slice(0, 200);
      if (!ids.length) throw new Error("Nobody to notify");
      await notifyUsers({ userIds: ids, event: "team_reminder", title, body: clip(p.body, 1000) || `Sent by Donna for ${me.full_name || me.email}`, link: "/notifications" });
      return { ok: true, message: `Done. ${ids.length} ${ids.length === 1 ? "person has" : "people have"} been reminded.`, stamp: "NOTIFIED", title };
    }
  }
  return { ok: false, message: "I don't know how to do that yet." };
}
