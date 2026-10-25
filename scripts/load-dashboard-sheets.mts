// Loads tabs converted by scripts/xlsx-to-dashboard-sheets.py as editable dashboard Sheets, shared with one
// department (they then show as that department's sub-tabs). One-way: edits stay in the dashboard.
//   npx tsx scripts/load-dashboard-sheets.mts <out dir> <department key> [--owner <profile id>]
// A tab that was already loaded (same source, marked in the description) is skipped, so a re-run
// never overwrites what the team has edited since.
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
config({ path: ".env.local", quiet: true });

const [dir, dept] = process.argv.slice(2);
const ownerIdx = process.argv.indexOf("--owner");
const owner = ownerIdx > 0 ? process.argv[ownerIdx + 1] : null;
if (!dir || !dept) throw new Error("usage: load-dashboard-sheets.mts <out dir> <department key> [--owner <profile id>]");
const db = createClient(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

// Excel drops "/" from tab names and cuts them at 31 characters: put the Google Sheet names back
const REAL_NAMES: Record<string, string> = {
  "Reconciliation Invoiced Sales v": "Reconciliation Invoiced Sales v P&L",
  "VA HiringWowPack": "VA Hiring/WowPack",
  "WO CC": "W/O CC",
  "REMOVED  CANCELLED": "REMOVED / CANCELLED",
};

type Tab = { name: string; source: string; columns: string[]; widths: number[]; has_notes: boolean; rows: Record<string, string>[] };
const files: string[] = JSON.parse(readFileSync(`${dir}/_index.json`, "utf8"));
const { data: existing } = await db.from("sheets").select("id, description").like("description", "%[import:%");
const loaded = new Set((existing ?? []).map((s) => /\[import:([^\]]+)\]/.exec(s.description ?? "")?.[1]).filter(Boolean));
const day = new Date().toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Dublin" });

let made = 0;
for (const f of files) {
  const t: Tab = JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
  const name = REAL_NAMES[t.name] ?? t.name;
  const marker = `${dept}:${t.source.split(" › ")[0]} › ${name}`;
  if (loaded.has(marker)) {
    console.log("SKIP (already loaded)", name);
    continue;
  }
  const { data: sheet, error } = await db
    .from("sheets")
    .insert({
      name,
      emoji: "💶",
      description: `Copied from ${t.source.split(" › ")[0]} › ${name} on ${day}. Edits here stay in the dashboard (nothing goes back to the Google Sheet). [import:${marker}]`,
      visibility: "departments",
      departments: [dept],
      created_by: owner,
    })
    .select("id")
    .single();
  if (error || !sheet) {
    console.log("FAIL", name, error?.message);
    continue;
  }
  const colDefs = t.columns.map((c, i) => ({ sheet_id: sheet.id, name: c, type: "text", position: i, width: Math.min(Math.max(t.widths[i] ?? 140, 60), 600) }));
  if (t.has_notes) colDefs.push({ sheet_id: sheet.id, name: "Sheet notes", type: "text", position: colDefs.length, width: 320 });
  const { data: cols, error: ce } = await db.from("sheet_columns").insert(colDefs).select("id, position");
  if (ce || !cols) {
    console.log("FAIL columns", name, ce?.message);
    continue;
  }
  const idAt = new Map(cols.map((c) => [c.position as number, c.id as string]));
  const notesId = t.has_notes ? idAt.get(t.columns.length) : undefined;
  const rows = t.rows.map((r, i) => {
    const cells: Record<string, string> = {};
    for (const [k, v] of Object.entries(r)) {
      if (k === "notes") {
        if (notesId) cells[notesId] = v;
      } else {
        const id = idAt.get(Number(k));
        if (id) cells[id] = v;
      }
    }
    return { sheet_id: sheet.id, position: i + 1, cells, created_by: owner };
  });
  let bad = false;
  for (let i = 0; i < rows.length; i += 500) {
    const { error: re } = await db.from("sheet_rows").insert(rows.slice(i, i + 500));
    if (re) {
      console.log("FAIL rows", name, re.message);
      bad = true;
      break;
    }
  }
  if (bad) continue;
  made++;
  console.log(`OK   ${name.padEnd(40)} ${rows.length} rows`);
}
console.log(`${made} sheet(s) created for department "${dept}"`);
