// One-time import of Customer Payments › " Client VA Payments" into client_payments (the CRM's payment records).
// Input: the tab as converted by scripts/xlsx-to-sheet-mirror.py (acc-client-payments.json).
//   npx tsx scripts/import-client-payments.mts <acc-client-payments.json>            # dry run: shows the matching
//   npx tsx scripts/import-client-payments.mts <acc-client-payments.json> --apply    # writes
// Each sheet line becomes one payment row (source_key = sheet row, so a re-run adds nothing twice).
// Client names are matched to CRM clients (fuzzy: "Matt Hopely" = "Matt Hopley"); names that match no
// client become new VA clients: live when they appear in the last 6 pay-runs, churned when older.
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { assembleRows, parsePayRuns } from "../src/lib/mirror";
import { jaroWinkler } from "../src/lib/fuzzy";
import { addDaysIso, DEFAULT_DUE_DAYS, nameScore, nameTokens, parsePeriod, parseSheetDate } from "../src/lib/client-payments";
config({ path: ".env.local", quiet: true });

const file = process.argv[2];
const apply = process.argv.includes("--apply");
if (!file) throw new Error("usage: import-client-payments.mts <acc-client-payments.json> [--apply]");
const db = createClient(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

const j = JSON.parse(readFileSync(file, "utf8"));
const runs = parsePayRuns(assembleRows(j.parts)).filter((r) => r.lines.length);
const recent = new Set(runs.slice(-6).flatMap((r) => r.lines.map((l) => nameTokens(l.client).join(" "))));

type Client = { id: string; name: string };
const { data: crm } = await db.from("clients").select("id, name");
const known: Client[] = (crm ?? []) as Client[];
const { data: placements } = await db.from("va_placements").select("id, client_id, va_name");

// sheet name → CRM client (best fuzzy match), or a new client grouped with its spelling variants
const sheetNames = [...new Set(runs.flatMap((r) => r.lines.map((l) => l.client.trim())))];
const latestSpelling = new Map<string, string>(); // later pay-runs win as the name to create
runs.forEach((r) => r.lines.forEach((l) => latestSpelling.set(nameTokens(l.client).join(" "), l.client.trim())));
const match = new Map<string, { id?: string; create?: string; score: number; to: string }>();
const toCreate: string[] = [];
for (const name of sheetNames) {
  let best: { c: Client; s: number } | null = null;
  for (const c of known) {
    const s = nameScore(name, c.name, jaroWinkler);
    if (s >= 0.92 && (!best || s > best.s)) best = { c, s };
  }
  if (best) {
    match.set(name, { id: best.c.id, score: best.s, to: best.c.name });
    continue;
  }
  const twin = toCreate.find((n) => nameScore(name, n, jaroWinkler) >= 0.94);
  const canonical = twin ?? latestSpelling.get(nameTokens(name).join(" ")) ?? name;
  if (!twin) toCreate.push(canonical);
  match.set(name, { create: canonical, score: 0, to: canonical });
}
const fuzzy = [...match.entries()].filter(([n, m]) => m.id && nameTokens(n).join(" ") !== nameTokens(m.to).join(" "));
console.log(`${runs.length} pay-runs, ${runs.reduce((a, r) => a + r.lines.length, 0)} lines, ${sheetNames.length} sheet names`);
console.log(`matched to existing clients: ${[...match.values()].filter((m) => m.id).length} (fuzzy ${fuzzy.length}); new clients: ${toCreate.length}`);
fuzzy.forEach(([n, m]) => console.log(`  fuzzy: "${n}" → "${m.to}" (${m.score.toFixed(3)})`));

if (!apply) {
  console.log("dry run: nothing written (add --apply)");
  process.exit(0);
}

// 1. new clients
const created = new Map<string, string>();
for (const name of toCreate) {
  const live = recent.has(nameTokens(name).join(" ")) || sheetNames.some((n) => match.get(n)?.create === name && recent.has(nameTokens(n).join(" ")));
  const { data, error } = await db
    .from("clients")
    .insert({ name, pipeline: "va", status: live ? "live" : "churned", remarks: "Added from the Client VA Payments sheet (payments import)", source_row_hash: `payments:${nameTokens(name).join("-")}` })
    .select("id")
    .single();
  if (error || !data) {
    const { data: again } = await db.from("clients").select("id").eq("source_row_hash", `payments:${nameTokens(name).join("-")}`).maybeSingle();
    if (!again) throw new Error(`client ${name}: ${error?.message}`);
    created.set(name, again.id);
  } else created.set(name, data.id);
}

// 2. payment lines
const today = new Date().toISOString().slice(0, 10);
const rows = runs.flatMap((r) => {
  const p = parsePeriod(r.label);
  return r.lines.map((l) => {
    const m = match.get(l.client.trim())!;
    const clientId = m.id ?? created.get(m.create!)!;
    const pl = (placements ?? []).find((x) => x.client_id === clientId && x.va_name && nameScore(x.va_name, l.va, jaroWinkler) >= 0.92);
    return {
      client_id: clientId,
      placement_id: pl?.id ?? null,
      va_name: l.va || null,
      period_label: r.label.replace(/\s+/g, " ").trim(),
      period_start: p?.start ?? null,
      period_end: p?.end ?? null,
      hours: l.hours,
      amount: Math.round(l.invoice * 100) / 100,
      currency: "EUR",
      invoice_no: l.xero || null,
      due_on: p ? addDaysIso(p.end, DEFAULT_DUE_DAYS) : null,
      paid_amount: Math.round(l.received * 100) / 100,
      paid_on: parseSheetDate(l.datePaid),
      note: [l.remark, l.notes, l.sheetStatus && `Status: ${l.sheetStatus}`].filter(Boolean).join(" · ") || null,
      source_key: `client-va-payments:${l.row}`,
    };
  });
});
let written = 0;
for (let i = 0; i < rows.length; i += 500) {
  const { error, count } = await db.from("client_payments").upsert(rows.slice(i, i + 500), { onConflict: "source_key", ignoreDuplicates: true, count: "exact" });
  if (error) throw new Error(error.message);
  written += count ?? 0;
}
console.log(`created ${created.size} clients; wrote ${written} payment rows (of ${rows.length}); today ${today}`);
