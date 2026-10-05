import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyUsers } from "@/lib/server/notify";
import type { Profile } from "@/lib/types";

/**
 * Alert managers/admins if the GHL webhook has delivered leads before but none
 * in the last 24h (usually a broken workflow or webhook). Stays silent until the
 * webhook has delivered at least one lead, so there is no noise before go-live.
 */
export async function checkLeadFeed(
  db: SupabaseClient,
  profiles: Profile[],
): Promise<{ alerted: boolean; reason?: string }> {
  const { count: ever } = await db
    .from("lead_events")
    .select("id", { head: true, count: "exact" })
    .eq("kind", "received")
    .eq("detail->>via", "webhook");
  if (!ever) return { alerted: false, reason: "webhook not live yet" };

  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const { count: recent } = await db
    .from("lead_events")
    .select("id", { head: true, count: "exact" })
    .eq("kind", "received")
    .eq("detail->>via", "webhook")
    .gte("created_at", since);
  if ((recent ?? 0) > 0) return { alerted: false };

  const text =
    "No new leads reached the dashboard in the last 24 hours. Check the GHL workflow 'Leads -> Dashboard', then press Sync now on the Leads page.";
  const managers = profiles.filter((p) => p.active && (p.role === "admin" || p.role === "manager")).map((p) => p.id);
  await notifyUsers({ userIds: managers, event: "stale_client", title: "No new leads in 24h", body: text, link: "/leads" });

  const hook = process.env.GOOGLE_CHAT_WEBHOOK_URL;
  if (hook) {
    await fetch(hook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `OSF dashboard: ${text}` }),
    }).catch(() => {});
  }
  return { alerted: true };
}
