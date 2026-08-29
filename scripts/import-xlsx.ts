/**
 * One-time importer: seeds the NEW Supabase project from the team spreadsheet.
 *
 *   npx tsx scripts/import-xlsx.ts "/path/to/External Hires Update.xlsx"
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment
 * (loaded from .env.local). Idempotent — safe to re-run; keyed on source_row_hash.
 */
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const FILE = process.argv[2];
if (!FILE) {
  console.error('Usage: npx tsx scripts/import-xlsx.ts "<path to .xlsx>"');
  process.exit(1);
}
const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local first.");
  process.exit(1);
}
const db = createClient(URL, KEY, { auth: { persistSession: false } });

const AI_SHEET = "AI Closed Sales  Onboarding Cal";
const VA_SHEET = "VA Closed Sales  Onboarding Cal";

const norm = (s: unknown) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");
const hash = (parts: unknown[]) =>
  createHash("sha1").update(parts.map((p) => String(p ?? "")).join("|")).digest("hex").slice(0, 16);

type Report = { sheet: string; row: number; client: string; issue: string }[];
const report: Report = [];

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v == null) return "";
  if (typeof v === "object" && "text" in v) return String((v as { text: string }).text).trim();
  if (typeof v === "object" && "result" in v) return String((v as { result: unknown }).result ?? "").trim();
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

function toDate(s: string): string | null {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
function toNum(s: string): number | null {
  const n = Number(String(s).replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) && s.trim() !== "" ? n : null;
}

const RB_MAP: Record<string, string> = {
  approved: "approved",
  "pending - docs": "docs_needed",
  "pending-docs": "docs_needed",
  submitted: "submitted",
  rejected: "rejected",
};
const BUILD_MAP: Record<string, string> = {
  approved: "approved",
  submitted: "submitted",
  rejected: "rejected",
  "in progress": "in_progress",
};

const AI_STAGE_MAP: Record<string, string> = {
  "not yet started": "Sale closed",
  "pending - docs": "Docs collection",
  "in progress": "Build",
  "ready for testing": "Client testing",
  submitted: "Check by Paul",
  approved: "Live",
  withrawn: "Withdrawn",
  withdrawn: "Withdrawn",
  rejected: "Rejected",
};
const VA_STAGE_MAP: Record<string, string> = {
  active: "Active",
  "inactive - client cancelled": "Inactive",
  "inactive/campaign cancelled": "Inactive",
  done: "Active",
};

async function loadStages() {
  const { data } = await db.from("pipeline_stages").select("id, pipeline, name");
  const map = new Map<string, string>();
  for (const s of data ?? []) map.set(`${s.pipeline}:${s.name}`, s.id);
  return map;
}
async function loadTemplates() {
  const { data } = await db.from("checklist_templates").select("pipeline, key, label, position");
  return data ?? [];
}

function headerIndex(sheet: ExcelJS.Worksheet, headerRow: number) {
  const idx: Record<string, number> = {};
  sheet.getRow(headerRow).eachCell((cell, col) => {
    const key = norm(cellText(cell));
    if (key && !(key in idx)) idx[key] = col;
  });
  return idx;
}

type Tpl = { pipeline: string; key: string; label: string; position: number };

async function importAI(wb: ExcelJS.Workbook, stages: Map<string, string>, templates: Tpl[]) {
  const sheet = wb.getWorksheet(AI_SHEET);
  if (!sheet) return;
  const H = headerIndex(sheet, 1);
  const get = (row: ExcelJS.Row, name: string) => (H[name] ? cellText(row.getCell(H[name])) : "");

  const grouped = new Map<string, { client: Record<string, unknown>; lines: Record<string, unknown>[]; rows: number[] }>();

  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const name = get(row, "client name") || get(row, "industry");
    const month = get(row, "month");
    if (!name && !month) return;
    const clientName = name || `Unnamed (${month})`;
    const ghl = get(row, "sub account") || get(row, "ghl link");
    const groupKey = norm(clientName) || norm(ghl) || `row-${rowNumber}`;

    const statusRaw = norm(get(row, "campagin status") || get(row, "campaign status"));
    const stageName = AI_STAGE_MAP[statusRaw] ?? "Sale closed";
    const stageId = stages.get(`ai:${stageName}`) ?? null;

    if (!grouped.has(groupKey)) {
      grouped.set(groupKey, {
        client: {
          pipeline: "ai",
          name: clientName,
          industry: get(row, "industry") || null,
          country: get(row, "country") || null,
          source: get(row, "source") || null,
          closed_by: get(row, "assigned to") || null,
          demo_call_date: toDate(get(row, "demo call date")),
          start_date: toDate(get(row, "start date")),
          stage_id: stageId,
          status: statusRaw.includes("withr") || statusRaw.includes("withd") ? "withdrawn" : statusRaw === "rejected" ? "rejected" : stageName === "Live" ? "live" : "active",
          setup_fee: toNum(get(row, "setup fee")),
          daily_rate: toNum(get(row, "daily rate")),
          remarks: get(row, "remarks") || null,
          source_row_hash: hash(["ai", groupKey]),
        },
        lines: [],
        rows: [],
      });
    }
    const g = grouped.get(groupKey)!;
    g.rows.push(rowNumber);

    const phone = get(row, "ai phone #");
    const rbRaw = norm(get(row, "rb"));
    g.lines.push({
      label: get(row, "twilio acc") || phone || null,
      ai_phone_number: phone || null,
      twilio_subaccount: get(row, "twilio acc") || null,
      ghl_location_id: extractLocationId(get(row, "sub account") || get(row, "ghl link")),
      dashboard_url: firstUrl(get(row, "dashboard link")),
      booking_system: get(row, "booking system") || null,
      regulatory_bundle_status: RB_MAP[rbRaw] ?? "not_started",
      prompt_status: BUILD_MAP[norm(get(row, "prompt"))] ?? (get(row, "prompt") ? "in_progress" : "not_started"),
      kb_status: BUILD_MAP[norm(get(row, "kb"))] ?? (get(row, "kb") ? "in_progress" : "not_started"),
      workflow_status: BUILD_MAP[norm(get(row, "workflow"))] ?? (get(row, "workflow") ? "in_progress" : "not_started"),
      notes: null,
    });
    if (!stageId) report.push({ sheet: "AI", row: rowNumber, client: clientName, issue: `Unmapped status "${statusRaw}"` });
  });

  for (const [, g] of grouped) {
    const { data: existing } = await db
      .from("clients")
      .select("id")
      .eq("source_row_hash", g.client.source_row_hash as string)
      .maybeSingle();

    let clientId = existing?.id as string | undefined;
    if (clientId) {
      await db.from("clients").update(g.client).eq("id", clientId);
      await db.from("client_lines").delete().eq("client_id", clientId);
    } else {
      const { data, error } = await db.from("clients").insert(g.client).select("id").single();
      if (error) {
        report.push({ sheet: "AI", row: g.rows[0], client: String(g.client.name), issue: error.message });
        continue;
      }
      clientId = data.id;
      const tpl = templates.filter((t) => t.pipeline === "ai");
      await db.from("checklist_items").insert(
        tpl.map((t) => ({ client_id: clientId, key: t.key, label: t.label, position: t.position })),
      );
    }
    await db.from("client_lines").insert(g.lines.map((l) => ({ ...l, client_id: clientId })));
  }
  console.log(`AI: imported ${grouped.size} clients`);
}

async function importVA(wb: ExcelJS.Workbook, stages: Map<string, string>, templates: Tpl[]) {
  const sheet = wb.getWorksheet(VA_SHEET);
  if (!sheet) return;
  const H = headerIndex(sheet, 1);
  const get = (row: ExcelJS.Row, name: string) => (H[name] ? cellText(row.getCell(H[name])) : "");

  let count = 0;
  const rows: ExcelJS.Row[] = [];
  sheet.eachRow((row, n) => {
    if (n === 1) return;
    rows.push(row);
  });

  for (const row of rows) {
    const rowNumber = row.number;
    const clientName = get(row, "client name");
    if (!clientName) continue;
    const statusRaw = norm(get(row, "campaign status") || get(row, "ob status"));
    const stageName = VA_STAGE_MAP[statusRaw] ?? "Sale closed";
    const stageId = stages.get(`va:${stageName}`) ?? null;
    const rowHash = hash(["va", norm(clientName), norm(get(row, "va name")), get(row, "start date")]);

    const client = {
      pipeline: "va",
      name: clientName,
      country: get(row, "country") || null,
      source: get(row, "sales type") || null,
      closed_by: get(row, "closed by") || null,
      start_date: toDate(get(row, "start date")),
      demo_call_date: toDate(get(row, "date")),
      stage_id: stageId,
      status: statusRaw.startsWith("inactive") ? "churned" : stageName === "Active" ? "live" : "active",
      hiring_fee_status: norm(get(row, "hiring fee status")) === "paid" ? "paid" : "pending",
      hiring_fee_invoice: get(row, "hiring fee invoice") || null,
      hiring_fee_paid: get(row, "hiring fee paid") || null,
      source_row_hash: rowHash,
    };

    const { data: existing } = await db.from("clients").select("id").eq("source_row_hash", rowHash).maybeSingle();
    let clientId = existing?.id as string | undefined;
    if (clientId) {
      await db.from("clients").update(client).eq("id", clientId);
      await db.from("va_placements").delete().eq("client_id", clientId);
    } else {
      const { data, error } = await db.from("clients").insert(client).select("id").single();
      if (error) {
        report.push({ sheet: "VA", row: rowNumber, client: clientName, issue: error.message });
        continue;
      }
      clientId = data.id;
      const tpl = templates.filter((t) => t.pipeline === "va");
      await db.from("checklist_items").insert(
        tpl.map((t) => ({ client_id: clientId, key: t.key, label: t.label, position: t.position })),
      );
    }
    await db.from("va_placements").insert({
      client_id: clientId,
      va_name: get(row, "va name") || null,
      va_email: get(row, "va email") || null,
      va_cv_url: firstUrl(get(row, "va cv")),
      tracker_url: firstUrl(get(row, "dashboard link")),
      role: get(row, "role") || null,
      employment_type: get(row, "employment type") || null,
      placement_status: statusRaw.includes("client cancel")
        ? "inactive_client_cancelled"
        : statusRaw.includes("campaign cancel")
          ? "inactive_campaign_cancelled"
          : "active",
    });
    if (!stageId) report.push({ sheet: "VA", row: rowNumber, client: clientName, issue: `Unmapped status "${statusRaw}"` });
    count += 1;
  }
  console.log(`VA: imported ${count} clients`);
}

function extractLocationId(url: string): string | null {
  const m = url.match(/location\/([A-Za-z0-9]+)/);
  return m ? m[1] : null;
}
function firstUrl(s: string): string | null {
  const m = s.match(/https?:\/\/\S+/);
  return m ? m[0] : null;
}

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(path.resolve(FILE));
  const stages = await loadStages();
  const templates = (await loadTemplates()) as Tpl[];

  await importAI(wb, stages, templates);
  await importVA(wb, stages, templates);

  const csv =
    "sheet,row,client,issue\n" +
    report.map((r) => `${r.sheet},${r.row},"${r.client.replace(/"/g, "'")}","${r.issue.replace(/"/g, "'")}"`).join("\n");
  writeFileSync("import-report.csv", csv);
  console.log(`\nWrote import-report.csv (${report.length} rows need review)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
