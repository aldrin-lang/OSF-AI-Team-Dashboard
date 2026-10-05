import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { parseCandidatePayload } from "@/lib/ops-core";
import { receiveCandidate } from "@/lib/server/candidates";

// Receives PIT (job application) form submissions from a GHL workflow Webhook action.
// Stores the candidate, runs the AI screening and sends the role recommendation to managers.
// Auth: same shared secret as the lead webhook (`x-webhook-secret` header or `?key=`). Fails CLOSED.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

  const c = parseCandidatePayload(body);
  if (!c.externalKey && !c.fullName) {
    return NextResponse.json({ error: "no contact_id, email or name in payload" }, { status: 422 });
  }

  try {
    const r = await receiveCandidate(c);
    return NextResponse.json({ ok: true, candidate_id: r.id, created: r.created });
  } catch (e) {
    console.error("[candidate webhook]", e);
    return NextResponse.json({ error: "could not store candidate" }, { status: 500 });
  }
}
