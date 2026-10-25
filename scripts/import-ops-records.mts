// One-time import of the VA Managers + Recruitment sheets into CRM records.
// Input: the tabs converted by scripts/xlsx-to-sheet-mirror.py (<key>.json files):
//   vam-masterlist (VA placements), vam-call-logs (check-in day, CSM, phone), vam-redflag, vam-replacements,
//   vam-cancelled, rec-openings (client requests), rec-va-closed-sales-onboarding-cal (onboarding + hiring fees).
//   npx tsx scripts/import-ops-records.mts <dir>            # dry run: counts and client matching only
//   npx tsx scripts/import-ops-records.mts <dir> --apply    # writes
// Every row gets a source_key (tab + sheet row), so a re-run skips what is already in.
// Client names are matched to CRM clients like the payments import (fuzzy, >= 0.92); a name that matches
// nothing becomes a new client (VA side) with a status taken from that sheet row.
import { config } from "dotenv";
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { assembleRows, money, type MirrorRow } from "../src/lib/mirror";
import { jaroWinkler } from "../src/lib/fuzzy";
import { nameScore, nameTokens, parseSheetDate } from "../src/lib/client-payments";
import {
  changeStatusFrom,
  employmentFrom,
  feeStatusFrom,
  obStatusFrom,
  roleStageFrom,
  roleStatusFor,
  vaStatusFrom,
} from "../src/lib/ops-records";
config({ path: ".env.local", quiet: true });

const dir = process.argv[2];
const apply = process.argv.includes("--apply");
if (!dir) throw new Error("usage: import-ops-records.mts <dir> [--apply]");
const db = createClient(process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

// ---------------------------------------------------------------- reading a tab
type Tab = { rows: { num: number; get: (name: string, nth?: number) => string; at: (i: number) => string }[]; header: string[] };
function tab(key: string): Tab {
  const j = JSON.parse(readFileSync(`${dir}/${key}.json`, "utf8"));
  const all: MirrorRow[] = assembleRows(j.parts);
  const filled = (r: MirrorRow) => r.cells.filter((c) => c.v.trim()).length;
  const h = all.slice(0, 6).reduce((best, r, i) => (filled(r) > filled(all[best]) ? i : best), 0);
  const header = all[h].cells.map((c) => c.v.trim().replace(/\s+/g, " ").toLowerCase());
  const idx = (name: string, nth = 0) => header.map((x, i) => (x === name.toLowerCase() ? i : -1)).filter((i) => i >= 0)[nth] ?? -1;
  return {
    header,
    rows: all.slice(h + 1).map((r) => ({
      num: r.num,
      get: (name: string, nth = 0) => {
        const i = idx(name, nth);
        return i >= 0 ? (r.cells[i]?.v ?? "").trim() : "";
      },
      at: (i: number) => (r.cells[i]?.v ?? "").trim(),
    })),
  };
}
const date = (v: string) => parseSheetDate(v);
const amt = (v: string) => (v.trim() ? Math.round(money(v) * 100) / 100 : null);
const text = (v: string, max = 2000) => (v.trim() ? v.trim().slice(0, max) : null);

// ---------------------------------------------------------------- clients
type Client = { id: string; name: string };
async function readAll<T>(table: string, cols: string): Promise<T[]> {
  const out: T[] = [];
  for (let a = 0; ; a += 1000) {
    const { data, error } = await db.from(table).select(cols).order("id").range(a, a + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data ?? []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}
const known: Client[] = await readAll<Client>("clients", "id, name");
const toCreate = new Map<string, { name: string; status: string }>(); // token key → new client
function clientFor(name: string, statusIfNew: string): { id?: string; key: string } | null {
  const n = name.trim();
  if (!n || nameTokens(n).length === 0) return null;
  let best: { c: Client; s: number } | null = null;
  for (const c of known) {
    const s = nameScore(n, c.name, jaroWinkler);
    if (s >= 0.92 && (!best || s > best.s)) best = { c, s };
  }
  if (best) return { id: best.c.id, key: best.c.id };
  for (const [k, v] of toCreate) if (nameScore(n, v.name, jaroWinkler) >= 0.94) return { key: k };
  const key = `new:${nameTokens(n).join("-")}`;
  toCreate.set(key, { name: n, status: statusIfNew });
  return { key };
}

// ---------------------------------------------------------------- read every tab
const master = tab("vam-masterlist");
const calls = tab("vam-call-logs");
const flags = tab("vam-redflag");
const repl = tab("vam-replacements");
const cancelled = tab("vam-cancelled");
const openings = tab("rec-openings");
const onboard = tab("rec-va-closed-sales-onboarding-cal");

const RECENT = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10); // last 4 months
const plan = {
  placements: master.rows.filter((r) => r.get("client name") && r.get("va name")).map((r) => ({ r, c: clientFor(r.get("client name"), vaStatusFrom(r.get("status")) === "inactive" ? "churned" : "live") })),
  checkins: calls.rows.filter((r) => r.get("client") && r.get("monthly schedule")),
  flags: flags.rows.filter((r) => r.get("client name")).map((r) => ({ r, c: clientFor(r.get("client name"), "live") })),
  repl: repl.rows.filter((r) => r.get("client")).map((r) => ({ r, c: clientFor(r.get("client"), "live") })),
  cancelled: cancelled.rows.filter((r) => r.get("client name")).map((r) => ({ r, c: clientFor(r.get("client name"), "churned") })),
  roles: openings.rows.filter((r) => r.get("client")).map((r) => {
    // a request alone says little about the client today: only a recent open request counts as active
    const o = r.get("opportunity status").toLowerCase();
    const recent = (date(r.get("date")) ?? "") >= RECENT;
    return { r, c: clientFor(r.get("client"), o.includes("lost") ? "withdrawn" : recent && !o.includes("live") ? "active" : "churned") };
  }),
  onboard: onboard.rows.filter((r) => r.get("client name")).map((r) => {
    const s = r.get("campaign status").toLowerCase();
    return { r, c: clientFor(r.get("client name"), s === "active" ? "live" : s.includes("scheduled") ? "active" : s.includes("withdrawn") ? "withdrawn" : s ? "churned" : "active") };
  }),
};
console.log(
  `placements ${plan.placements.length}, check-in days ${plan.checkins.length}, red flags ${plan.flags.length}, ` +
    `replacements ${plan.repl.length}, cancellations ${plan.cancelled.length}, requests ${plan.roles.length}, onboarding ${plan.onboard.length}`,
);
console.log(`clients to create: ${toCreate.size}`, [...toCreate.values()].reduce((m: Record<string, number>, v) => ((m[v.status] = (m[v.status] ?? 0) + 1), m), {}));
if (!apply) {
  console.log("dry run: nothing written (add --apply)");
  process.exit(0);
}

// ---------------------------------------------------------------- 1. new clients
const ids = new Map<string, string>();
for (const [key, v] of toCreate) {
  const hash = `ops:${key.slice(4)}`;
  const { data, error } = await db.from("clients").insert({ name: v.name, pipeline: "va", status: v.status, remarks: "Added from the VA Managers / Recruitment sheets (CRM import)", source_row_hash: hash }).select("id").single();
  if (data) ids.set(key, data.id);
  else {
    const { data: again } = await db.from("clients").select("id").eq("source_row_hash", hash).maybeSingle();
    if (!again) throw new Error(`client ${v.name}: ${error?.message}`);
    ids.set(key, again.id);
  }
}
const cid = (c: { id?: string; key: string } | null) => (c ? (c.id ?? ids.get(c.key) ?? null) : null);

async function insertNew(table: string, rows: Record<string, unknown>[]) {
  let n = 0;
  for (let i = 0; i < rows.length; i += 400) {
    const { error, count } = await db.from(table).upsert(rows.slice(i, i + 400), { onConflict: "source_key", ignoreDuplicates: true, count: "exact" });
    if (error) throw new Error(`${table}: ${error.message}`);
    n += count ?? 0;
  }
  return n;
}

// ---------------------------------------------------------------- 2. VA placements (update the ones already in the CRM)
type Placement = { id: string; client_id: string; va_name: string | null; source_key: string | null };
const placements = await readAll<Placement>("va_placements", "id, client_id, va_name, source_key");
let updated = 0;
const newPlacements: Record<string, unknown>[] = [];
for (const { r, c } of plan.placements) {
  const client_id = cid(c);
  if (!client_id) continue;
  const status = vaStatusFrom(r.get("status"));
  const fields = {
    manager_name: text(r.get("manager"), 80),
    client_email: text(r.get("client email"), 200),
    country: text(r.get("country"), 80),
    role: text(r.get("va role"), 200),
    employment_type: employmentFrom(r.get("employement")),
    start_date: date(r.get("start date", 1)) ?? date(r.get("start date")),
    daily_hours: amt(r.get("daily hours")),
    hours_per_week: amt(r.get("daily hours")) ? Math.min(80, Math.max(1, Math.round((amt(r.get("daily hours")) as number) * 5))) : null,
    va_pay: amt(r.get("va pay")),
    client_pay_gbp: amt(r.get("client pay in gbp")),
    client_pay_usd: amt(r.get("client pay in usd")),
    profit_per_hour: amt(r.get("profit per hour")),
    monthly_profit: amt(r.get("monthly profit")),
    removed_on: date(r.get("removed / inactivity date")),
    placement_status: status === "inactive" ? "inactive_client_cancelled" : "active",
    on_pause: status === "paused",
    notes: text(r.get("comments")),
  };
  const key = `masterlist:${r.num}`;
  if (placements.some((p) => p.source_key === key)) continue;
  const existing = placements.find((p) => p.client_id === client_id && !p.source_key && p.va_name && nameScore(p.va_name, r.get("va name"), jaroWinkler) >= 0.92);
  if (existing) {
    const { error } = await db.from("va_placements").update({ ...fields, source_key: key }).eq("id", existing.id);
    if (error) throw new Error(`placement ${r.get("va name")}: ${error.message}`);
    existing.source_key = key;
    updated++;
  } else newPlacements.push({ client_id, va_name: r.get("va name"), ...fields, source_key: key });
}
const placedNew = await insertNew("va_placements", newPlacements);
const allPlacements = await readAll<Placement>("va_placements", "id, client_id, va_name, source_key");
const placementFor = (client_id: string | null, va: string) =>
  client_id && va ? allPlacements.find((p) => p.client_id === client_id && p.va_name && nameScore(p.va_name, va, jaroWinkler) >= 0.92)?.id ?? null : null;

// ---------------------------------------------------------------- 3. check-in day, CSM, phone, GHL link
let days = 0;
for (const r of plan.checkins) {
  const c = clientFor(r.get("client"), "live");
  const id = cid(c);
  const day = Number(r.get("monthly schedule"));
  if (!id || !Number.isInteger(day) || day < 1 || day > 31) continue;
  const { error } = await db
    .from("clients")
    .update({ checkin_day: day, csm_name: text(r.get("client success manager"), 80), phone: text(r.get("client phone"), 40), ghl_url: text(r.get("ghl link"), 500) })
    .eq("id", id)
    .is("checkin_day", null);
  if (!error) days++;
}

// ---------------------------------------------------------------- 4. red flags, replacements, cancellations
const flagRows = plan.flags.map(({ r, c }) => {
  const client_id = cid(c);
  return client_id
    ? {
        client_id,
        placement_id: placementFor(client_id, r.get("va name")),
        va_name: text(r.get("va name"), 120),
        focus: r.get("focus").toLowerCase() === "va" ? "va" : "client",
        manager_name: text(r.get("manager"), 80),
        reason: text(r.get("reason")),
        rca: text(r.get("rca")),
        action_taken: text(r.get("action taken")),
        status: r.get("status").toLowerCase().includes("inactive") ? "resolved" : "open",
        added_on: date(r.get("added date")) ?? new Date().toISOString().slice(0, 10),
        notes: text(r.get("comments")),
        source_key: `redflag:${r.num}`,
      }
    : null;
}).filter(Boolean) as Record<string, unknown>[];
const replRows = plan.repl.map(({ r, c }) => {
  const client_id = cid(c);
  return client_id
    ? {
        kind: r.get("issue type").toLowerCase().startsWith("cancel") ? "cancellation" : "replacement",
        client_id,
        placement_id: placementFor(client_id, r.get("va name")),
        va_name: text(r.get("va name"), 120),
        reason_tag: text(r.get("tag"), 80),
        reason: text(r.get("reason")),
        last_day: date(r.get("last date of the va")),
        notified_on: date(r.get("notif date")),
        initiated_by: text(r.get("initiated by"), 80),
        assigned_to: text(r.get("assigned to"), 80),
        status: changeStatusFrom(r.get("status")),
        status_detail: text(r.get("status"), 80),
        notes: text(r.get("notes")),
        source_key: `replacement:${r.num}`,
      }
    : null;
}).filter(Boolean) as Record<string, unknown>[];
const cancelRows = plan.cancelled.map(({ r, c }) => {
  const client_id = cid(c);
  const ctl = r.get("controllable").toLowerCase();
  return client_id
    ? {
        kind: "cancellation",
        client_id,
        placement_id: placementFor(client_id, r.get("va name")),
        va_name: text(r.get("va name"), 120),
        va_role: text(r.get("va role"), 200),
        manager_name: text(r.get("manager"), 80),
        reason: text(r.get("reason")),
        rca: text(r.get("rca")),
        controllable: ctl === "yes" ? true : ctl === "no" ? false : null,
        action_next: text(r.get("action going forward")),
        last_day: date(r.get("end of contract")),
        started_on: date(r.get("start date")),
        status: "cancelled",
        monthly_profit: amt(r.get("projected monthly profit")),
        source_key: `cancelled-campaign:${r.num}`,
      }
    : null;
}).filter(Boolean) as Record<string, unknown>[];

// ---------------------------------------------------------------- 5. client requests (va_roles) and onboarding
const candidateCols = openings.header.map((h, i) => (/^candidate \d+$/.test(h) ? i : -1)).filter((i) => i >= 0);
const roleRows = plan.roles.map(({ r, c }) => {
  const client_id = cid(c);
  if (!client_id) return null;
  const stage = roleStageFrom(r.get("endorsement status"), r.get("opportunity status"));
  const endorsed = candidateCols
    .map((i) => ({ name: r.at(i), email: r.at(i + 1), cv: r.at(i + 2), portfolio: r.at(i + 3) }))
    .filter((x) => x.name);
  const hire = r.get("hire type").toLowerCase();
  return {
    client_id,
    title: (r.get("va title") || r.get("va type needed") || "VA").slice(0, 120),
    status: roleStatusFor(stage),
    stage,
    stage_detail: text(r.get("endorsement status"), 80),
    requested_on: date(r.get("date")),
    closed_on: date(r.get("date closed")),
    manager_name: text(r.get("va manager assigned"), 80),
    sdr: text(r.get("sdr"), 80),
    hire_type: hire.startsWith("replac") ? "Replacement" : hire === "internal" ? "Internal" : hire ? "New" : null,
    country: text(r.get("country"), 80),
    va_type: text(r.get("va type needed"), 200),
    industry: text(r.get("industry"), 200),
    work_arrangement: text(r.get("work arrangment"), 200),
    interview_schedule: text(r.get("interview schedule"), 200),
    reengagement_status: text(r.get("re-engagement status"), 80),
    rework_reason: text(r.get("rework reason")),
    hiring_notes: text(r.get("hiring notes")),
    requirements: text(r.get("overview of responsibilities"), 4000),
    notes: text(r.get("notes")),
    endorsed,
    source_key: `openings:${r.num}`,
  };
}).filter(Boolean) as Record<string, unknown>[];
const obRows = plan.onboard.map(({ r, c }) => {
  const client_id = cid(c);
  return client_id
    ? {
        client_id,
        placement_id: placementFor(client_id, r.get("va name")),
        va_name: text(r.get("va name"), 120),
        va_email: text(r.get("va email"), 200),
        va_cv: text(r.get("va cv"), 500),
        role: text(r.get("role"), 200),
        employment_type: text(r.get("employment type"), 40),
        sales_type: text(r.get("sales type"), 40),
        closed_on: date(r.get("date")),
        closed_by: text(r.get("closed by"), 80),
        manager_name: text(r.get("va manager"), 80),
        contacted_by_am: text(r.get("contacted by am"), 80),
        ob_status: obStatusFrom(r.get("ob status")),
        ob_status_detail: text(r.get("ob status"), 80),
        ob_date: date(r.get("ob date")),
        start_date: date(r.get("start date")),
        country: text(r.get("country"), 80),
        campaign_status: text(r.get("campaign status"), 80),
        reengagement_status: text(r.get("re-engagement status"), 80),
        fee_status: feeStatusFrom(r.get("hiring fee status")),
        fee_status_detail: text(r.get("hiring fee status"), 80),
        fee_invoice: text(r.get("hiring fee invoice"), 80),
        fee_paid: text(r.get("hiring fee paid"), 80),
        source_key: `onboarding:${r.num}`,
      }
    : null;
}).filter(Boolean) as Record<string, unknown>[];

const out = {
  clients_created: ids.size,
  placements_updated: updated,
  placements_added: placedNew,
  checkin_days_set: days,
  red_flags: await insertNew("red_flags", flagRows),
  replacements_and_cancellations: await insertNew("va_changes", [...replRows, ...cancelRows]),
  client_requests: await insertNew("va_roles", roleRows),
  onboarding: await insertNew("onboardings", obRows),
};
console.log(out);
