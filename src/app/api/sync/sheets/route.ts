import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getAdminSupabase } from "@/lib/supabase/server";
import { isArea } from "@/lib/areas";
import { isDepartment } from "@/lib/departments";
import { validRows } from "@/lib/mirror";

// Receives the team's Google Sheet tabs from the "OSF Morning Report" Apps Script
// (syncDashboard, every 30 min) and stores them in sheet_mirror for the department pages.
// A tab arrives in parts (Vercel caps a request at ~4.5 MB). Parts go in under the
// upload's sync_id; the last part switches the tab over and removes the old parts.
// Body { prune: true, keep: [keys] } removes tabs the script no longer sends.
// Auth: `x-sync-secret` header = SHEET_SYNC_SECRET. Fails CLOSED.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function safeEqual(a: string, b: string) {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

const KEY_RE = /^[a-z0-9-]{1,60}$/;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
const int = (v: unknown, max: number) => (Number.isInteger(v) && (v as number) >= 0 ? Math.min(v as number, max) : 0);
const nums = (v: unknown, max: number) => (Array.isArray(v) ? v.filter((x) => Number.isInteger(x)).slice(0, max) : []);

export async function POST(request: Request) {
  // trimmed: a secret pasted from `openssl rand -hex 32` easily carries a trailing newline
  const secret = process.env.SHEET_SYNC_SECRET?.trim();
  if (!secret) return NextResponse.json({ error: "sync not configured" }, { status: 503 });
  const provided = (request.headers.get("x-sync-secret") ?? "").trim();
  if (!provided || !safeEqual(provided, secret)) {
    // fingerprints (first 6 hex of SHA-256) let the owner see which side holds a different secret, without revealing either
    const fp = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 6);
    return NextResponse.json({ error: "unauthorized", server: fp(secret), sent: fp(provided) }, { status: 401 });
  }

  let b: Record<string, unknown>;
  try {
    b = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "body must be JSON" }, { status: 400 });
  }
  const db = getAdminSupabase();

  if (b.prune === true) {
    const keep = Array.isArray(b.keep) ? b.keep.filter((k): k is string => typeof k === "string" && KEY_RE.test(k)) : [];
    if (!keep.length) return NextResponse.json({ error: "keep list is empty" }, { status: 422 });
    const { data: all } = await db.from("sheet_mirror").select("key");
    const gone = (all ?? []).map((r) => r.key as string).filter((k) => !keep.includes(k));
    if (gone.length) await db.from("sheet_mirror").delete().in("key", gone);
    return NextResponse.json({ ok: true, removed: gone });
  }

  const key = str(b.key, 60);
  const syncId = str(b.sync_id, 40);
  const part = int(b.part, 10_000);
  const parts = int(b.parts, 10_000);
  if (!KEY_RE.test(key) || !/^[A-Za-z0-9_-]{4,40}$/.test(syncId) || parts < 1 || part >= parts) {
    return NextResponse.json({ error: "bad key, sync_id or part" }, { status: 422 });
  }
  if (!isDepartment(b.department) || !isArea(b.area)) {
    return NextResponse.json({ error: "unknown department or area" }, { status: 422 });
  }
  if (!validRows(b.rows) || !Array.isArray(b.styles)) {
    return NextResponse.json({ error: "rows/styles missing" }, { status: 422 });
  }

  const meta = {
    key,
    department: b.department,
    area: b.area,
    label: str(b.label, 80) || key,
    position: int(b.position, 10_000),
    source_name: str(b.source_name, 200),
    source_url: str(b.source_url, 500),
    frozen_rows: int(b.frozen_rows, 20),
    frozen_cols: int(b.frozen_cols, 10),
    col_widths: nums(b.col_widths, 1000),
    merges: Array.isArray(b.merges) ? b.merges.filter((m) => Array.isArray(m) && m.length === 4).slice(0, 5000) : [],
    row_count: int(b.row_count, 1_000_000),
    col_count: int(b.col_count, 10_000),
  };

  // the tab row must exist before its parts (it keeps showing the previous upload until the last part)
  const up = await db.from("sheet_mirror").upsert(meta, { onConflict: "key" });
  if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 });

  const ins = await db
    .from("sheet_mirror_parts")
    .upsert({ key, sync_id: syncId, part, styles: b.styles, rows: b.rows }, { onConflict: "key,sync_id,part" });
  if (ins.error) return NextResponse.json({ error: ins.error.message }, { status: 500 });

  if (part === parts - 1) {
    const { count } = await db
      .from("sheet_mirror_parts")
      .select("part", { count: "exact", head: true })
      .eq("key", key)
      .eq("sync_id", syncId);
    if (count !== parts) {
      return NextResponse.json({ error: `only ${count} of ${parts} parts arrived; keeping the previous copy` }, { status: 409 });
    }
    const done = await db
      .from("sheet_mirror")
      .update({ parts, sync_id: syncId, synced_at: new Date().toISOString() })
      .eq("key", key);
    if (done.error) return NextResponse.json({ error: done.error.message }, { status: 500 });
    await db.from("sheet_mirror_parts").delete().eq("key", key).neq("sync_id", syncId);
  }
  return NextResponse.json({ ok: true, key, part, parts });
}
