import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase/server";

// Uptime check. Public: { ok } only. With the CRON_SECRET (x-health-key header or
// ?key=) it also returns lead-flow numbers, so an uptime monitor can alert when
// leads stop arriving. Point UptimeRobot (or similar) at /api/health and, with
// the key, look for the keyword  "ok":true .
export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string) {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}

export async function GET(request: Request) {
  try {
    const db = getAdminSupabase();
    const { error } = await db.from("setters").select("id", { head: true, count: "exact" }).limit(1);
    if (error) throw error;

    const secret = process.env.CRON_SECRET;
    const key = request.headers.get("x-health-key") ?? new URL(request.url).searchParams.get("key") ?? "";
    if (!secret || !key || !safeEqual(key, secret)) {
      return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    }

    const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
    const [last, viaWebhook24h, unassigned] = await Promise.all([
      db.from("lead_events").select("created_at").eq("kind", "received").eq("detail->>via", "webhook")
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("lead_events").select("id", { head: true, count: "exact" }).eq("kind", "received")
        .eq("detail->>via", "webhook").gte("created_at", since),
      db.from("leads").select("id", { head: true, count: "exact" }).is("setter_id", null)
        .eq("historical", false).in("status", ["new", "contacted", "call_booked", "no_answer"]),
    ]);

    return NextResponse.json(
      {
        ok: true,
        last_webhook_lead_at: last.data?.created_at ?? null,
        webhook_leads_24h: viaWebhook24h.count ?? 0,
        unassigned_open_leads: unassigned.count ?? 0,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({ ok: false }, { status: 503 });
  }
}
