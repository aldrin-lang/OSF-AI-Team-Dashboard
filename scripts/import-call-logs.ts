/**
 * One-time import of the ACTIVE clients in VA Ops › "Client Call Logs" into the real dashboard
 * pages (Aldrin, 2026-10-21):
 *
 *   - Clients (VA pipeline): one client per name, status Live, stage "Active", earliest VA start date.
 *     Client Success Manager, phone, GHL link and monthly call day go into Remarks (Kris/Josef have
 *     no dashboard login yet, so they can't be the Manager).
 *   - VAs: one active placement per sheet row (VA name + start date).
 *   - Check-ins › Done: each monthly call (date cell + its note, plus "October - AI Call update")
 *     becomes a done client check-in with the notes as the reply.
 *
 * Dashboard check-ins are paused for these clients and VAs: the team does check-ins in the sheet and
 * through the AI calls, so the daily job must not start drafting emails for them.
 *
 * Input: the JSON grids exported by the "OSF Morning Report" Apps Script (exportForDashboard).
 *
 *   npx tsx scripts/import-call-logs.ts <grids.json>            # dry run
 *   npx tsx scripts/import-call-logs.ts <grids.json> --apply    # writes
 *
 * Idempotent: clients are keyed by source_row_hash "calllogs:<hash of name>"; existing ones are skipped
 * with their VAs and check-ins.
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

type Grid = string[][];
const file = process.argv[2];
const APPLY = process.argv.includes("--apply");
if (!file) {
  console.error("Usage: npx tsx scripts/import-call-logs.ts <grids.json> [--apply]");
  process.exit(1);
}
const g = JSON.parse(readFileSync(file, "utf8")) as Record<string, Grid>;
const clean = (s: string | undefined) => String(s ?? "").replace(/\r/g, "").trim();
const one = (s: string | undefined) => clean(s).replace(/\s+/g, " ");

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const MON3 = MONTHS.map((m) => m.slice(0, 3));
const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();

/** "Aug 5, 2024", "March 6,2025", "October 14, 2026" → YYYY-MM-DD (null if unreadable). */
function parseDate(s: string): string | null {
  const m = one(s).toLowerCase().match(/^([a-z]+)\.?\s*(\d{1,2})\s*,?\s*(\d{4})$/);
  if (!m) return null;
  const mi = MON3.indexOf(m[1].slice(0, 3));
  const y = Number(m[3]), d = Number(m[2]);
  if (mi < 0 || d < 1 || d > lastDay(y, mi)) return null;
  return `${y}-${pad(mi + 1)}-${pad(d)}`;
}

/** Month column header ("April" = 2024, then "January 2025" …) → [year, monthIndex]. */
function monthOf(header: string): [number, number] | null {
  const m = one(header).toLowerCase().match(/^([a-z]+)(?:\s+(\d{4}))?$/);
  if (!m) return null;
  const mi = MONTHS.indexOf(m[1]);
  if (mi < 0) return null;
  return [m[2] ? Number(m[2]) : 2024, mi];
}

const v = g.calls_values, n = g.calls_notes;
const head = v[0].map(one);
const col = (name: string) => head.findIndex((h) => h.toLowerCase() === name.toLowerCase());
const C = {
  client: col("Client"), va: col("VA Name"), csm: col("Client Success Manager"), start: col("Start Date"),
  status: col("Status"), phone: col("Client Phone"), ghl: col("GHL Link"), schedule: col("Monthly Schedule"),
};
if (Object.values(C).some((i) => i < 0)) throw new Error("Client Call Logs headers changed: " + JSON.stringify(C));
const aiCol = head.findIndex((h) => /ai call update/i.test(h));
const monthCols = head.map((h, i) => ({ i, ym: monthOf(h) })).filter((x): x is { i: number; ym: [number, number] } => !!x.ym);
const aiMonth = aiCol >= 0 ? monthCols.find((m) => MONTHS[m.ym[1]] === one(head[aiCol]).toLowerCase().split(/\s+/)[0] && m.ym[0] === Math.max(...monthCols.map((x) => x.ym[0]))) : undefined;

interface Call { due_on: string; label: string; reply: string }
interface VaRow { va: string; start: string | null; calls: Call[]; phone: string; ghl: string; csm: string; schedule: string }
const byClient = new Map<string, VaRow[]>();
for (let r = 1; r < v.length; r++) {
  const row = v[r], notes = n[r] ?? [];
  if (one(row[C.status]) !== "Active") continue;
  const name = one(row[C.client]);
  if (!name) continue;
  const calls: Call[] = [];
  for (const { i, ym } of monthCols) {
    let value = clean(row[i]);
    let note = clean(notes[i]);
    if (aiMonth && i === aiMonth.i) {
      const ai = [clean(row[aiCol]), clean(notes[aiCol])].filter(Boolean).join("\n");
      if (ai) note = [note, `AI call update: ${ai}`].filter(Boolean).join("\n\n");
    }
    if (!value && !note) continue;
    const [y, mi] = ym;
    const dm = value.match(/\b([12]?\d|3[01])\b/);
    const day = Math.min(Math.max(dm ? Number(dm[1]) : 1, 1), lastDay(y, mi));
    if (/^\d{1,2}$/.test(value)) value = "";
    calls.push({
      due_on: `${y}-${pad(mi + 1)}-${pad(day)}`,
      label: `${MONTHS[mi][0].toUpperCase()}${MONTHS[mi].slice(1)} ${y}`,
      reply: [value && `Logged: ${value}`, note].filter(Boolean).join("\n\n").slice(0, 8000),
    });
  }
  const list = byClient.get(name) ?? [];
  list.push({
    va: one(row[C.va]), start: parseDate(row[C.start]), calls,
    phone: one(row[C.phone]), ghl: one(row[C.ghl]), csm: one(row[C.csm]), schedule: one(row[C.schedule]),
  });
  byClient.set(name, list);
}

const uniqJoin = (xs: string[]) => [...new Set(xs.filter(Boolean))].join(" / ");
const plan = [...byClient].map(([name, rows]) => {
  const starts = rows.map((r) => r.start).filter((s): s is string => !!s).sort();
  const remarks = [
    `Imported from VA Ops › Client Call Logs (${new Date().toISOString().slice(0, 10)}).`,
    uniqJoin(rows.map((r) => r.csm)) && `Client Success Manager: ${uniqJoin(rows.map((r) => r.csm))}`,
    uniqJoin(rows.map((r) => r.phone)) && `Phone: ${uniqJoin(rows.map((r) => r.phone))}`,
    uniqJoin(rows.map((r) => r.schedule)) && `Monthly call day: ${uniqJoin(rows.map((r) => r.schedule))}`,
    ...[...new Set(rows.map((r) => r.ghl).filter(Boolean))].map((u) => `GHL: ${u}`),
  ].filter(Boolean).join("\n");
  return { name, start: starts[0] ?? null, remarks, rows, hash: "calllogs:" + createHash("sha256").update(name.toLowerCase()).digest("hex").slice(0, 16) };
});

console.log(`Active rows: ${plan.reduce((s, p) => s + p.rows.length, 0)} · clients: ${plan.length} · check-ins: ${plan.reduce((s, p) => s + p.rows.reduce((t, r) => t + r.calls.length, 0), 0)}`);
for (const p of plan.slice(0, 3)) console.log(`  e.g. ${p.name} · start ${p.start} · VAs ${p.rows.map((r) => r.va).join(", ")} · calls ${p.rows.map((r) => r.calls.length).join("+")}`);
const noStart = plan.filter((p) => !p.start).map((p) => p.name);
if (noStart.length) console.log(`  no readable start date: ${noStart.join(", ")}`);

async function main() {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  const db = createClient(url, key, { auth: { persistSession: false } });

  const { data: stage, error: se } = await db.from("pipeline_stages").select("id").eq("pipeline", "va").eq("name", "Active").single();
  if (se || !stage) throw new Error("VA stage 'Active' not found");
  const { data: existing } = await db.from("clients").select("source_row_hash, name, pipeline").or(`source_row_hash.in.(${plan.map((p) => `"${p.hash}"`).join(",")}),pipeline.eq.va`);
  const done = new Set((existing ?? []).map((x) => x.source_row_hash));
  const vaNames = new Set((existing ?? []).filter((x) => x.pipeline === "va").map((x) => String(x.name).toLowerCase()));
  const todo = plan.filter((p) => !done.has(p.hash));
  const clash = todo.filter((p) => vaNames.has(p.name.toLowerCase())).map((p) => p.name);
  console.log(`Already imported: ${plan.length - todo.length} · to create: ${todo.length}${clash.length ? ` · same name as an existing VA client: ${clash.join(", ")}` : ""}`);
  if (!APPLY) {
    console.log("Dry run. Re-run with --apply to write.");
    return;
  }

  let clients = 0, placements = 0, checkins = 0;
  for (const p of todo) {
    const { data: c, error: ce } = await db.from("clients").insert({
      pipeline: "va", name: p.name, status: "live", stage_id: stage.id,
      stage_entered_at: p.start ? `${p.start}T09:00:00Z` : new Date().toISOString(),
      start_date: p.start, source: "Client Call Logs", remarks: p.remarks, source_row_hash: p.hash, checkin_paused: true,
    }).select("id").single();
    if (ce || !c) throw new Error(`Client ${p.name}: ${ce?.message}`);
    clients++;
    for (const r of p.rows) {
      const { data: pl, error: pe } = await db.from("va_placements").insert({
        client_id: c.id, va_name: r.va || null, start_date: r.start, placement_status: "active", checkin_paused: true,
      }).select("id").single();
      if (pe || !pl) throw new Error(`VA ${r.va} for ${p.name}: ${pe?.message}`);
      placements++;
      if (!r.calls.length) continue;
      const { error: ke } = await db.from("checkins").insert(r.calls.map((k) => ({
        kind: "client", client_id: c.id, placement_id: pl.id, due_on: k.due_on, contact_name: p.name,
        contact_phone: r.phone || null, channel: "call", status: "done",
        subject: `${k.label} check-in call${r.va ? ` (VA: ${r.va})` : ""}`, reply: k.reply,
      })));
      if (ke) throw new Error(`Check-ins for ${p.name}: ${ke.message}`);
      checkins += r.calls.length;
    }
  }
  console.log(`Created ${clients} clients, ${placements} VAs, ${checkins} done check-ins.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
