import "server-only";
import { getAdminSupabase } from "@/lib/supabase/server";
import { aiConfigured, aiErrorMessage, aiText } from "@/lib/server/ai";
import { emailShell, sendEmail } from "@/lib/server/email";
import { areaUserIds } from "@/lib/server/notify";
import { addDays, dublinDayBounds, escapeHtml, formatMoney, textToHtml } from "@/lib/ops-core";
import { OPEN_STATUSES } from "@/lib/leads-ingest";

export interface DailyMetrics {
  date: string;
  leads: {
    received: number;
    by_service: Record<string, number>;
    by_source: Record<string, number>;
    by_setter: Record<string, number>;
    open_total: number;
    open_untouched: number;
    open_unassigned: number;
    status_changes: number;
    won: number;
  };
  clients: { new: number; live: number; onboarding: number; stage_moves: number };
  concerns: { opened: number; resolved: number; open_total: number; urgent_open: number };
  tasks: { completed: number; overdue: number };
  candidates: { received: number; shortlisted_total: number; top: { name: string; role: string | null; score: number | null }[] };
  checkins: { sent: number; replies: number; at_risk_open: number; waiting_to_send: number };
  payments: {
    outstanding: Record<string, number>;
    overdue_count: number;
    overdue: Record<string, number>;
    paid_today: number;
    reminders_sent: number;
    reminders_waiting: number;
  };
}

function bump(map: Record<string, number>, key: string | null | undefined, by = 1) {
  const k = key && key.trim() ? key.trim() : "Unknown";
  map[k] = (map[k] ?? 0) + by;
}

/** Everything that happened on one Dublin calendar day, plus where things stand now. */
export async function computeDailyMetrics(date: string): Promise<DailyMetrics> {
  const db = getAdminSupabase();
  const { start, end } = dublinDayBounds(date);

  const [
    leadsToday,
    openLeads,
    leadEvents,
    setters,
    clientsAll,
    stageMoves,
    concernsOpened,
    concernsResolved,
    concernsOpen,
    tasksDone,
    tasksOverdue,
    candsToday,
    candsShort,
    ckSent,
    ckReplies,
    ckRisk,
    ckDue,
    invOpen,
    invPaid,
    remSent,
    remWaiting,
  ] = await Promise.all([
    db.from("leads").select("service, source, setter_id").eq("historical", false).gte("received_at", start).lt("received_at", end),
    db.from("leads").select("status, setter_id").eq("historical", false).in("status", [...OPEN_STATUSES]).limit(10000),
    db.from("lead_events").select("kind, summary").gte("created_at", start).lt("created_at", end),
    db.from("setters").select("id, name"),
    db.from("clients").select("status, created_at"),
    db.from("activity_log").select("id").eq("verb", "stage_changed").gte("created_at", start).lt("created_at", end),
    db.from("concerns").select("id").gte("created_at", start).lt("created_at", end),
    db.from("concerns").select("id").gte("resolved_at", start).lt("resolved_at", end),
    db.from("concerns").select("severity").neq("status", "resolved"),
    db.from("tasks").select("id").eq("status", "done").gte("updated_at", start).lt("updated_at", end),
    db.from("tasks").select("id").eq("status", "open").lt("due_date", date),
    db.from("candidates").select("full_name, ai_recommended_role, ai_score").gte("created_at", start).lt("created_at", end),
    db.from("candidates").select("id").eq("status", "shortlisted"),
    db.from("checkins").select("id").gte("sent_at", start).lt("sent_at", end),
    db.from("checkins").select("id").not("reply", "is", null).gte("updated_at", start).lt("updated_at", end),
    db.from("checkins").select("id").eq("mood", "at_risk").eq("status", "replied"),
    db.from("checkins").select("id").eq("status", "due"),
    db.from("invoices").select("amount, currency, due_on").eq("status", "open"),
    db.from("invoices").select("id").eq("status", "paid").eq("paid_on", date),
    db.from("payment_reminders").select("id").gte("sent_at", start).lt("sent_at", end),
    db.from("payment_reminders").select("id").eq("status", "draft"),
  ]);

  const setterName = new Map((setters.data ?? []).map((s) => [s.id as string, s.name as string]));
  const m: DailyMetrics = {
    date,
    leads: {
      received: 0,
      by_service: {},
      by_source: {},
      by_setter: {},
      open_total: openLeads.data?.length ?? 0,
      open_untouched: (openLeads.data ?? []).filter((l) => l.status === "new").length,
      open_unassigned: (openLeads.data ?? []).filter((l) => !l.setter_id).length,
      status_changes: (leadEvents.data ?? []).filter((e) => e.kind === "status").length,
      won: (leadEvents.data ?? []).filter((e) => e.kind === "converted" || /→ Won$/.test(String(e.summary))).length,
    },
    clients: {
      new: (clientsAll.data ?? []).filter((c) => c.created_at >= start && c.created_at < end).length,
      live: (clientsAll.data ?? []).filter((c) => c.status === "live").length,
      onboarding: (clientsAll.data ?? []).filter((c) => c.status === "active").length,
      stage_moves: stageMoves.data?.length ?? 0,
    },
    concerns: {
      opened: concernsOpened.data?.length ?? 0,
      resolved: concernsResolved.data?.length ?? 0,
      open_total: concernsOpen.data?.length ?? 0,
      urgent_open: (concernsOpen.data ?? []).filter((c) => c.severity === "urgent" || c.severity === "high").length,
    },
    tasks: { completed: tasksDone.data?.length ?? 0, overdue: tasksOverdue.data?.length ?? 0 },
    candidates: {
      received: candsToday.data?.length ?? 0,
      shortlisted_total: candsShort.data?.length ?? 0,
      top: (candsToday.data ?? [])
        .map((c) => ({ name: c.full_name as string, role: c.ai_recommended_role as string | null, score: c.ai_score as number | null }))
        .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
        .slice(0, 3),
    },
    checkins: {
      sent: ckSent.data?.length ?? 0,
      replies: ckReplies.data?.length ?? 0,
      at_risk_open: ckRisk.data?.length ?? 0,
      waiting_to_send: ckDue.data?.length ?? 0,
    },
    payments: {
      outstanding: {},
      overdue_count: 0,
      overdue: {},
      paid_today: invPaid.data?.length ?? 0,
      reminders_sent: remSent.data?.length ?? 0,
      reminders_waiting: remWaiting.data?.length ?? 0,
    },
  };

  for (const l of leadsToday.data ?? []) {
    m.leads.received += 1;
    bump(m.leads.by_service, l.service as string);
    bump(m.leads.by_source, l.source as string);
    bump(m.leads.by_setter, l.setter_id ? setterName.get(l.setter_id as string) : "Unassigned");
  }
  for (const i of invOpen.data ?? []) {
    const amt = Number(i.amount) || 0;
    bump(m.payments.outstanding, i.currency as string, amt);
    if ((i.due_on as string) < date) {
      m.payments.overdue_count += 1;
      bump(m.payments.overdue, i.currency as string, amt);
    }
  }
  return m;
}

const money = (r: Record<string, number>) =>
  Object.entries(r)
    .map(([c, v]) => formatMoney(v, c))
    .join(" + ") || "0";

const list = (r: Record<string, number>) =>
  Object.entries(r)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `${k} ${v}`)
    .join(", ") || "none";

/** Plain summary used when AI is off (and given to the AI as the facts). */
export function factsText(m: DailyMetrics): string {
  return [
    `Date: ${m.date}`,
    `Leads: ${m.leads.received} new (by service: ${list(m.leads.by_service)}; by source: ${list(m.leads.by_source)}; by setter: ${list(m.leads.by_setter)}). Open now ${m.leads.open_total}, not touched ${m.leads.open_untouched}, unassigned ${m.leads.open_unassigned}. ${m.leads.status_changes} status updates, ${m.leads.won} won.`,
    `Clients: ${m.clients.new} new, ${m.clients.onboarding} onboarding, ${m.clients.live} live, ${m.clients.stage_moves} stage moves.`,
    `Concerns: ${m.concerns.opened} opened, ${m.concerns.resolved} resolved, ${m.concerns.open_total} open (${m.concerns.urgent_open} high/urgent).`,
    `Tasks: ${m.tasks.completed} completed, ${m.tasks.overdue} overdue.`,
    `Candidates: ${m.candidates.received} applied${m.candidates.top.length ? ` (top: ${m.candidates.top.map((c) => `${c.name} → ${c.role ?? "?"}${c.score != null ? ` ${c.score}` : ""}`).join("; ")})` : ""}, ${m.candidates.shortlisted_total} shortlisted in total.`,
    `Check-ins: ${m.checkins.sent} sent, ${m.checkins.replies} replies, ${m.checkins.at_risk_open} at risk, ${m.checkins.waiting_to_send} waiting to be sent.`,
    `Payments: outstanding ${money(m.payments.outstanding)}; ${m.payments.overdue_count} overdue invoices (${money(m.payments.overdue)}); ${m.payments.paid_today} paid; ${m.payments.reminders_sent} reminders sent, ${m.payments.reminders_waiting} drafts waiting.`,
  ].join("\n");
}

const SUMMARY_SYSTEM = `You write the morning report for the managers of OutsourceForce (AI receptionists and Philippine VAs for UK/Irish small businesses).
From the facts given, write a short report in plain English:
- First line: one sentence on how the day went.
- Then 3 to 6 bullet points ("- ") with the numbers that matter.
- Then "Needs attention:" with up to 3 bullet points of concrete actions (for example unassigned or untouched leads, at-risk clients, overdue invoices, check-ins waiting), or "Needs attention: nothing urgent".
Use only the facts given. Do not invent numbers, names or reasons. No markdown headings, no bold.`;

export async function runDailyReport(
  date: string,
  opts: { email: boolean },
): Promise<{ ok: boolean; emailed: number; error?: string }> {
  const db = getAdminSupabase();
  const metrics = await computeDailyMetrics(date);
  const facts = factsText(metrics);

  let summary = facts;
  let error: string | undefined;
  if (aiConfigured()) {
    try {
      summary = await aiText(SUMMARY_SYSTEM, `<facts>\n${facts}\n</facts>`, "low");
    } catch (e) {
      error = aiErrorMessage(e);
    }
  }

  const { data: saved, error: upErr } = await db
    .from("daily_reports")
    .upsert({ report_date: date, metrics, summary }, { onConflict: "report_date" })
    .select("id, emailed_at")
    .single();
  if (upErr) return { ok: false, emailed: 0, error: upErr.message };

  let emailed = 0;
  if (opts.email && !saved.emailed_at) {
    // Admins, plus anyone whose department has been given Reports on /admin.
    const ids = await areaUserIds("reports");
    const { data: people } = ids.length
      ? await db.from("profiles").select("email").in("id", ids)
      : { data: [] as { email: string }[] };
    const to = (people ?? []).map((p) => p.email as string).filter(Boolean);
    if (to.length) {
      const appUrl = process.env.APP_URL ?? "";
      const res = await sendEmail({
        to,
        subject: `Daily report: ${date} · ${metrics.leads.received} leads, ${metrics.payments.overdue_count} overdue invoices`,
        html: emailShell(
          `Daily report · ${escapeHtml(date)}`,
          textToHtml(summary),
          `${appUrl}/reports/daily?date=${date}`,
          "Open full report",
        ),
        text: summary,
      });
      if (res.ok && !res.skipped) {
        emailed = to.length;
        await db.from("daily_reports").update({ emailed_at: new Date().toISOString() }).eq("id", saved.id);
      }
    }
  }
  return { ok: true, emailed, error };
}

export function yesterday(today: string): string {
  return addDays(today, -1);
}
