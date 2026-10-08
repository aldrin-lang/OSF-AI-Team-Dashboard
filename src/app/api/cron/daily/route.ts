import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { checkLeadFeed } from "@/lib/server/lead-heartbeat";
import { getAdminSupabase } from "@/lib/supabase/server";
import { allRows } from "@/lib/server/paged";
import { notifyUsers } from "@/lib/server/notify";
import { sendEmail, emailShell } from "@/lib/server/email";
import { daysSince } from "@/lib/utils";
import { dublinDate, addDays } from "@/lib/ops-core";
import { generateDueCheckins } from "@/lib/server/checkins";
import { generateReminderDrafts } from "@/lib/server/payments";
import { resumeUnfinishedCandidates } from "@/lib/server/candidates";
import { runDailyReport } from "@/lib/server/daily-report";
import type { Client, NotificationPreferences, PipelineStage, Profile } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // AI drafting + the daily report summary

const STALE_DAYS = 7;

export async function GET(request: Request) {
  // Fail closed: without CRON_SECRET this endpoint refuses to run for anyone.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }
  const provided =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace("Bearer ", "") ??
    "";
  const same = timingSafeEqual(
    createHash("sha256").update(provided).digest(),
    createHash("sha256").update(secret).digest(),
  );
  if (!same) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = getAdminSupabase();
  const [clients, { data: stages }, { data: profiles }, { data: prefs }] =
    await Promise.all([
      allRows((a, b) => admin.from("clients").select("*").not("status", "in", "(withdrawn,rejected,churned)").order("id").range(a, b)),
      admin.from("pipeline_stages").select("*"),
      admin.from("profiles").select("*").eq("active", true),
      admin.from("notification_preferences").select("*"),
    ]);

  const stageById = new Map<string, PipelineStage>(
    ((stages as PipelineStage[]) ?? []).map((s) => [s.id, s]),
  );
  const prefById = new Map<string, NotificationPreferences>(
    ((prefs as NotificationPreferences[]) ?? []).map((p) => [p.user_id, p]),
  );

  // ---- Staleness notifications --------------------------------------------
  const staleByManager = new Map<string, Client[]>();
  for (const c of (clients as Client[]) ?? []) {
    const st = c.stage_id ? stageById.get(c.stage_id) : null;
    const inactiveDays = daysSince(c.updated_at) ?? 0;
    const stageDays = daysSince(c.stage_entered_at) ?? 0;
    const overSla = st?.sla_days != null && stageDays > st.sla_days;
    const stale = inactiveDays >= STALE_DAYS;
    if ((overSla || stale) && c.manager_id) {
      const arr = staleByManager.get(c.manager_id) ?? [];
      arr.push(c);
      staleByManager.set(c.manager_id, arr);
    }
  }

  let staleNotifications = 0;
  for (const [managerId, list] of staleByManager) {
    await notifyUsers({
      userIds: [managerId],
      event: "stale_client",
      title: `${list.length} client${list.length === 1 ? "" : "s"} need attention`,
      body: list.map((c) => c.name).join(", "),
      link: "/",
    });
    staleNotifications += 1;
  }

  // ---- Digest emails -----------------------------------------------------
  const isMonday = new Date().getUTCDay() === 1;
  let digests = 0;
  for (const p of (profiles as Profile[]) ?? []) {
    const pref = prefById.get(p.id);
    const cadence = pref?.digest ?? "daily";
    if (cadence === "off") continue;
    if (cadence === "weekly" && !isMonday) continue;
    if (!p.email) continue;

    const mine = ((clients as Client[]) ?? []).filter((c) => c.manager_id === p.id);
    if (mine.length === 0) continue;

    const rows = mine
      .map((c) => {
        const st = c.stage_id ? stageById.get(c.stage_id) : null;
        const d = daysSince(c.stage_entered_at) ?? 0;
        const flag = st?.sla_days != null && d > st.sla_days ? " ⚠️" : "";
        return `<li>${c.name} — ${st?.name ?? "—"} (${d}d)${flag}</li>`;
      })
      .join("");

    await sendEmail({
      to: p.email,
      subject: `Your ${cadence} pipeline digest — ${mine.length} clients`,
      html: emailShell(
        `${cadence === "daily" ? "Daily" : "Weekly"} digest`,
        `<p>You manage ${mine.length} active client${mine.length === 1 ? "" : "s"}:</p><ul>${rows}</ul>`,
        `${process.env.APP_URL ?? ""}/`,
        "Open My Desk",
      ),
    });
    digests += 1;
  }

  // ---- Lead-feed heartbeat (alerts if the GHL webhook went quiet) ----------
  let leadFeed: { alerted: boolean; reason?: string } = { alerted: false };
  try {
    leadFeed = await checkLeadFeed(admin, (profiles as Profile[]) ?? []);
  } catch (e) {
    console.error("[cron] lead heartbeat failed", e);
  }

  // ---- Ops automations (each isolated so one failure doesn't stop the rest) --
  const today = dublinDate();
  const ops: Record<string, unknown> = {};
  try {
    ops.checkins = await generateDueCheckins(today);
  } catch (e) {
    console.error("[cron] check-ins failed", e);
    ops.checkins = { error: String(e) };
  }
  try {
    ops.candidates = await resumeUnfinishedCandidates();
  } catch (e) {
    console.error("[cron] candidate retries failed", e);
    ops.candidates = { error: String(e) };
  }
  try {
    const r = await generateReminderDrafts(today);
    ops.payment_reminders = { created: r.created };
  } catch (e) {
    console.error("[cron] payment reminders failed", e);
    ops.payment_reminders = { error: String(e) };
  }
  try {
    ops.daily_report = await runDailyReport(addDays(today, -1), { email: true });
  } catch (e) {
    console.error("[cron] daily report failed", e);
    ops.daily_report = { error: String(e) };
  }

  return NextResponse.json({
    ok: true,
    ran_at: new Date().toISOString(),
    stale_notifications: staleNotifications,
    digests_sent: digests,
    lead_feed: leadFeed,
    ...ops,
  });
}
