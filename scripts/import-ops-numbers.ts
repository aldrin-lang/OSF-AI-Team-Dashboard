/**
 * Loads the team's ops numbers into Reports › Team numbers (table ops_numbers, migration
 * 20261021000001_ops_numbers.sql). Aldrin, 2026-10-21.
 *
 *   daily_numbers ← OSF_Mastersheet 2026 › 6. Daily Numbers Crunch (Consult Call, Client Interviews,
 *                   Recruitment, Operations, Collections, Task List; Marketing / Re-engagement /
 *                   Sales Hunter / Appointment are the sales side, not our team, and are left out)
 *   accounts      ← Customer Payments [New] › OSF VA MOM v2 (month by month, with country breakdowns)
 *
 * Cell notes are kept. The teams keep using their Google Sheets: this is a snapshot. Re-running it
 * refreshes the snapshot (rows are upserted by source + section + label + sub_label).
 *
 * Input: the JSON grids exported by the "OSF Morning Report" Apps Script (exportForDashboard),
 * shaped { accounts_values, accounts_notes, master_values, master_notes, … }.
 *
 *   npx tsx scripts/import-ops-numbers.ts <grids.json>            # dry run
 *   npx tsx scripts/import-ops-numbers.ts <grids.json> --apply    # writes
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

type Grid = string[][];
interface Cell { k: string; v: string; n?: string }
interface Row { source: "daily_numbers" | "accounts"; section: string; label: string; sub_label: string; owner: string | null; target: string | null; position: number; cells: Cell[] }

const file = process.argv[2];
const APPLY = process.argv.includes("--apply");
if (!file) {
  console.error("Usage: npx tsx scripts/import-ops-numbers.ts <grids.json> [--apply]");
  process.exit(1);
}
const g = JSON.parse(readFileSync(file, "utf8")) as Record<string, Grid>;
const clean = (s: string | undefined) => String(s ?? "").replace(/\r/g, "").trim();
const one = (s: string | undefined) => clean(s).replace(/\s+/g, " ");
const cell = (k: string, v: string | undefined, n: string | undefined): Cell | null => {
  const value = clean(v), note = clean(n);
  if (!value && !note) return null;
  return note ? { k, v: value, n: note } : { k, v: value };
};
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

// ---------- Daily Numbers ----------
// Layout (Oct 2026): A = department, B = person in charge, C = metric, D = Daily Target, dates from E
// (weekly "Total" / "%" columns in between are skipped). Older layout: A = department, B = metric, dates from C.
const SECTIONS = ["marketing", "re-engagement", "sales hunter", "appointment", "consult call", "sales interview", "recruitment", "operations", "collections", "task list"];
const SKIP = ["marketing", "re-engagement", "sales hunter", "appointment"];
const SECTION_LABEL: Record<string, string> = { "sales interview": "Client Interviews", "consult call": "Consult Call", recruitment: "Recruitment", operations: "Operations", collections: "Collections", "task list": "Task List" };

function dailyNumbers(): Row[] {
  const v = g.master_values, n = g.master_notes;
  // date labels have no year ("October 20"): the sheet is OSF_Mastersheet 2026
  const dateOf = (h: string) => {
    const m = clean(h).match(/^([A-Za-z]+)\s+(\d{1,2})$/);
    const mi = m ? MONTHS.indexOf(m[1].toLowerCase()) : -1;
    return mi < 0 ? "" : `2026-${String(mi + 1).padStart(2, "0")}-${String(Number(m![2])).padStart(2, "0")}`;
  };
  const hr = v.findIndex((r) => r.filter((h) => dateOf(h)).length >= 5);
  if (hr < 0) throw new Error("Daily Numbers: date row not found");
  const dateCols = v[hr].map((h, c) => ({ c, iso: dateOf(h) })).filter((d) => d.iso);
  const first = Math.min(...dateCols.map((d) => d.c));
  const targetCol = [0, 1, 2, 3].map((r) => v[r] ?? []).reduce((f, row) => (f >= 0 ? f : row.findIndex((h) => /daily target/i.test(clean(h)))), -1);
  let metricCol = first - 1;
  while (metricCol === targetCol) metricCol--;
  const ownerCol = metricCol >= 2 ? 1 : -1;

  const out: Row[] = [];
  let section = "", quarter = "", owner = "";
  for (let r = hr + 1; r < v.length; r++) {
    const a = clean(v[r][0]).toLowerCase();
    const label = one(v[r][metricCol]);
    if (SECTIONS.includes(a)) { section = a; quarter = ""; owner = ownerCol >= 0 ? one(v[r][ownerCol]) : ""; continue; }
    if (/^q[1-4]$/.test(a)) { quarter = a.toUpperCase(); continue; }
    if (ownerCol >= 0 && clean(v[r][ownerCol])) owner = one(v[r][ownerCol]); // sometimes on the first metric row
    if (!section || SKIP.includes(section) || !label) continue;
    const cells = dateCols.map((d) => cell(d.iso, v[r][d.c], n[r]?.[d.c])).filter((c): c is Cell => !!c);
    out.push({
      source: "daily_numbers", section: SECTION_LABEL[section] ?? section, label, sub_label: quarter,
      owner: owner || null, target: (targetCol >= 0 && clean(v[r][targetCol])) || null, position: out.length, cells,
    });
  }
  return dedupe(out);
}

// ---------- Accounts ----------
function accounts(): Row[] {
  const v = g.accounts_values, n = g.accounts_notes;
  const head = v[0];
  const last = head.reduce((m, h, i) => (clean(h) ? i : m), 0);
  // "%" columns are the rate of the column before them
  const kpis: string[] = [];
  for (let c = 1; c <= last; c++) {
    const h = one(head[c]);
    kpis.push(h === "%" ? `${kpis[kpis.length - 1] ?? "Rate"} %` : h || `Column ${c + 1}`);
  }
  const out: Row[] = [];
  let year = "", month = "";
  for (let r = 1; r < v.length; r++) {
    const a = one(v[r][0]);
    const cells = kpis.map((k, i) => cell(k, v[r][i + 1], n[r]?.[i + 1])).filter((c): c is Cell => !!c);
    if (/^FY-\d{4}$/i.test(a)) {
      year = a.toUpperCase();
      month = "";
      if (cells.length) out.push({ source: "accounts", section: year, label: "Full year", sub_label: "", owner: null, target: null, position: out.length, cells });
      continue;
    }
    if (!a || !year) continue;
    const isCountry = /^(uk|ireland|nz|au|australia|canada|us)$/i.test(a);
    if (!isCountry) month = a;
    if (!cells.length) continue;
    out.push({ source: "accounts", section: year, label: isCountry ? month : a, sub_label: isCountry ? a : "", owner: null, target: null, position: out.length, cells });
  }
  return dedupe(out);
}

/** The table is unique on source + section + label + sub_label: number any repeats. */
function dedupe(rows: Row[]): Row[] {
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const k = [r.section, r.label, r.sub_label].join("\u0000").toLowerCase();
    const c = (seen.get(k) ?? 0) + 1;
    seen.set(k, c);
    return c === 1 ? r : { ...r, label: `${r.label} (${c})` };
  });
}

async function main() {
  const rows = [...dailyNumbers(), ...accounts()];
  for (const src of ["daily_numbers", "accounts"] as const) {
    const list = rows.filter((r) => r.source === src);
    const sections = [...new Set(list.map((r) => r.section))];
    const notes = list.reduce((k, r) => k + r.cells.filter((c) => c.n).length, 0);
    console.log(`${src}: ${list.length} rows, ${list.reduce((k, r) => k + r.cells.length, 0)} cells (${notes} with notes) · ${sections.join(", ")}`);
  }
  if (!APPLY) {
    console.log("Dry run. Re-run with --apply to write.");
    return;
  }
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  const db = createClient(url, key, { auth: { persistSession: false } });
  const now = new Date().toISOString();
  for (let i = 0; i < rows.length; i += 100) {
    const { error } = await db
      .from("ops_numbers")
      .upsert(rows.slice(i, i + 100).map((r) => ({ ...r, imported_at: now })), { onConflict: "source,section,label,sub_label" });
    if (error) throw new Error(error.message);
  }
  console.log(`Saved ${rows.length} rows.`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
