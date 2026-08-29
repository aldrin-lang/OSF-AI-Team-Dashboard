import "server-only";
import { getAdminSupabase } from "@/lib/supabase/server";
import { sendEmail, emailShell } from "@/lib/server/email";
import type { NotificationPreferences } from "@/lib/types";

export type NotifyEvent =
  | "assigned_to_me"
  | "mention"
  | "stage_change_my_client"
  | "concern_my_client"
  | "stale_client";

const PREF_KEYS: Record<NotifyEvent, { inApp: keyof NotificationPreferences; email: keyof NotificationPreferences }> = {
  assigned_to_me: { inApp: "assigned_to_me_in_app", email: "assigned_to_me_email" },
  mention: { inApp: "mention_in_app", email: "mention_email" },
  stage_change_my_client: { inApp: "stage_change_my_client_in_app", email: "stage_change_my_client_email" },
  concern_my_client: { inApp: "concern_my_client_in_app", email: "concern_my_client_email" },
  stale_client: { inApp: "stale_client_in_app", email: "stale_client_email" },
};

export interface NotifyInput {
  userIds: string[];
  event: NotifyEvent;
  title: string;
  body?: string;
  link?: string;
  /** Skip notifying this user (usually the actor). */
  exclude?: string | null;
}

/**
 * Write in-app notifications and send emails, honouring each user's
 * notification_preferences. Uses the service-role client so it works from
 * cron and server actions alike.
 */
export async function notifyUsers(input: NotifyInput) {
  const targets = [...new Set(input.userIds)].filter(
    (id) => id && id !== input.exclude,
  );
  if (targets.length === 0) return;

  const admin = getAdminSupabase();

  const { data: profiles } = await admin
    .from("profiles")
    .select("id, email, full_name, active")
    .in("id", targets);

  const { data: prefsRows } = await admin
    .from("notification_preferences")
    .select("*")
    .in("user_id", targets);

  const prefs = new Map<string, NotificationPreferences>(
    (prefsRows ?? []).map((p) => [p.user_id as string, p as NotificationPreferences]),
  );
  const keys = PREF_KEYS[input.event];
  const appUrl = process.env.APP_URL ?? "";
  const link = input.link ?? "/";

  const inAppRows: Array<Record<string, unknown>> = [];
  const emailTasks: Promise<unknown>[] = [];

  for (const p of profiles ?? []) {
    if (!p.active) continue;
    const pref = prefs.get(p.id as string);
    const wantInApp = pref ? pref[keys.inApp] !== false : true;
    const wantEmail = pref ? pref[keys.email] === true : false;

    if (wantInApp) {
      inAppRows.push({
        user_id: p.id,
        type: input.event,
        title: input.title,
        body: input.body ?? null,
        link,
      });
    }
    if (wantEmail && p.email) {
      emailTasks.push(
        sendEmail({
          to: p.email as string,
          subject: input.title,
          html: emailShell(
            input.title,
            input.body ? `<p>${input.body}</p>` : "",
            link.startsWith("http") ? link : `${appUrl}${link}`,
            "Open in Ops",
          ),
        }),
      );
    }
  }

  if (inAppRows.length) await admin.from("notifications").insert(inAppRows);
  await Promise.allSettled(emailTasks);
}
