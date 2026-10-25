"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getBrowserSupabase } from "@/lib/supabase/client";

/**
 * Which pages each table's changes can affect. A change only refreshes the page you are on when it
 * matters there (busy tables like leads or the activity log used to reload every open page).
 */
const TABLES: Record<string, string[]> = {
  clients: ["/", "/clients", "/pipeline", "/vas", "/check-ins", "/concerns", "/my-desk", "/d/accounts"],
  client_lines: ["/clients"],
  checklist_items: ["/clients", "/my-desk"],
  concerns: ["/concerns", "/clients", "/my-desk"],
  comments: ["/clients", "/concerns"],
  client_emails: ["/clients"],
  tasks: ["/clients", "/my-desk"],
  activity_log: ["/clients"],
  notifications: ["/notifications"],
  pipeline_stages: ["/", "/pipeline", "/clients"],
  leads: ["/leads"],
  lead_events: ["/leads"],
  candidates: ["/candidates", "/roles"],
  checkins: ["/check-ins", "/vas", "/clients", "/my-desk"],
  invoices: ["/payments"],
  payment_reminders: ["/payments"],
  setters: ["/leads"],
  sheets: ["/sheets"],
  va_roles: ["/roles", "/candidates"],
  va_role_candidates: ["/roles", "/candidates"],
  va_placements: ["/vas", "/clients", "/roles"],
  client_payments: ["/d/accounts"],
};
const MIN_GAP_MS = 3000; // at most one refresh every 3 s, however many changes arrive
const STALE_AFTER_MS = 60_000; // coming back to the tab only refreshes after a minute away

function affects(table: string, path: string): boolean {
  return (TABLES[table] ?? []).some((p) => (p === "/" ? path === "/" : path === p || path.startsWith(p + "/")));
}

export function RealtimeSync() {
  const router = useRouter();
  const [live, setLive] = useState(false);

  useEffect(() => {
    let cleanup = () => {};
    let timer: ReturnType<typeof setTimeout> | null = null;
    let last = 0;
    let hiddenAt = 0;

    const refresh = () => {
      last = Date.now();
      router.refresh();
    };
    const bump = (table: string) => {
      if (document.hidden || !affects(table, window.location.pathname)) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(refresh, Math.max(600, MIN_GAP_MS - (Date.now() - last)));
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
      for (const table of Object.keys(TABLES)) {
        ch = ch.on("postgres_changes", { event: "*", schema: "public", table }, () => bump(table));
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
      if (document.hidden) hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > STALE_AFTER_MS) refresh();
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
      className="pointer-events-none fixed bottom-3 left-3 z-40 flex items-center gap-1.5 rounded-full border border-line bg-surface/90 px-2.5 py-1 text-[11px] font-medium text-ink-muted shadow-sm backdrop-blur"
      title={live ? "Live — changes sync across the team" : "Reconnecting…"}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${live ? "animate-pulse bg-emerald-500" : "bg-ink-faint"}`}
      />
      {live ? "Live" : "Offline"}
    </div>
  );
}
