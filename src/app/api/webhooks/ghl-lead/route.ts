import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { parseGhlPayload } from "@/lib/leads-core";
import { ingestFromWebhook } from "@/lib/server/leads";

// Receives new leads from the GHL workflow "Leads -> Dashboard" (Webhook action).
// Auth: shared secret in the `x-webhook-secret` header, or `?key=` on the URL.
// Fails CLOSED: if GHL_WEBHOOK_SECRET is not configured the endpoint refuses everything.
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function safeEqual(a: string, b: string) {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export async function POST(request: Request) {
  const secret = process.env.GHL_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  }
  const provided =
    request.headers.get("x-webhook-secret") ?? new URL(request.url).searchParams.get("key") ?? "";
  if (!provided || !safeEqual(provided, secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }

  const lead = parseGhlPayload(body);
  if (!lead) {
    return NextResponse.json(
      { error: "no contact_id or opportunity_id in payload (check the GHL custom data keys)" },
      { status: 422 },
    );
  }

  try {
    const r = await ingestFromWebhook(lead);
    return NextResponse.json({
      ok: true,
      lead_id: r.leadId,
      created: r.created,
      historical: r.historical,
      setter: r.setterName,
    });
  } catch (e) {
    console.error("[ghl-lead webhook]", e);
    // 500 so GHL (or a retry job) knows it was not stored.
    return NextResponse.json({ error: "could not store lead" }, { status: 500 });
  }
}
