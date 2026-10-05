"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase/client";

const TABLES = [
  "clients",
  "client_lines",
  "checklist_items",
  "concerns",
  "comments",
  "client_emails",
  "tasks",
  "activity_log",
  "notifications",
  "pipeline_stages",
  "leads",
  "lead_events",
  "setters",
];

/**
 * App-wide live sync. Subscribes to Postgres change events and refreshes the
 * current route (debounced) so every open session sees teammates' edits within
 * about a second — Google-Sheets style. RLS still gates what each user receives.
 */
export function RealtimeSync() {
  const router = useRouter();
  const [live, setLive] = useState(false);

  useEffect(() => {
    let cleanup = () => {};
    let timer: ReturnType<typeof setTimeout> | null = null;

    const bump = () => {
      if (document.hidden) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 600);
    };

    (async () => {
      const sb = await getBrowserSupabase();

      // Realtime + RLS: the change stream is filtered by each row's SELECT
      // policy, which needs the user's JWT on the socket. Set it explicitly and
      // keep it fresh on token refresh.
      const {
        data: { session },
      } = await sb.auth.getSession();
      if (session?.access_token) sb.realtime.setAuth(session.access_token);

      const { data: authSub } = sb.auth.onAuthStateChange((_e, s) => {
        if (s?.access_token) sb.realtime.setAuth(s.access_token);
      });

      let ch = sb.channel("app-live", { config: { private: false } });
      for (const table of TABLES) {
        ch = ch.on("postgres_changes", { event: "*", schema: "public", table }, bump);
      }
      ch.subscribe((status) => setLive(status === "SUBSCRIBED"));

      cleanup = () => {
        authSub.subscription.unsubscribe();
        sb.removeChannel(ch);
      };
    })().catch(() => {
      /* config unavailable — app still works, just not live */
    });

    const onVisible = () => {
      if (!document.hidden) router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      cleanup();
    };
  }, [router]);

  return (
    <div
      className="pointer-events-none fixed bottom-3 left-3 z-40 flex items-center gap-1.5 rounded-full border border-line bg-white/90 px-2.5 py-1 text-[11px] font-medium text-ink-muted shadow-sm backdrop-blur"
      title={live ? "Live — changes sync across the team" : "Reconnecting…"}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${live ? "animate-pulse bg-emerald-500" : "bg-ink-faint"}`}
      />
      {live ? "Live" : "Offline"}
    </div>
  );
}
