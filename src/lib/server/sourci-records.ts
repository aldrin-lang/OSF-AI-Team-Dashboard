import "server-only";
import { getServerSupabase } from "@/lib/supabase/server";
import { CANDIDATE_STATUS, CHECKIN_MOOD, CHECKIN_STATUS, CLIENT_STATUS, HIRING_FEE_STATUS, LEAD_STATUS, PLACEMENT_STATUS, ROLE_PRIORITY, ROLE_STAGE, ROLE_STATUS } from "@/lib/labels";
import { addDays, dublinDate, dublinDayBounds, formatMoney, isIsoDate } from "@/lib/ops-core";
import type { Area } from "@/lib/areas";

/**
 * Sourci's general record engine: one search and one bulk change for every
 * kind of record, so new questions don't each need a hand-built tool.
 * All reads/writes use the signed-in user's Supabase client (RLS applies).
 */
type Db = Awaited<ReturnType<typeof getServerSupabase>>;
type Row = Record<string, unknown>;

export const ENTITY_KEYS = ["leads", "clients", "invoices", "candidates", "checkins", "concerns", "tasks", "vas", "roles", "role_candidates"] as const;
export type EntityKey = (typeof ENTITY_KEYS)[number];

type Kind = "text" | "enum" | "date" | "number" | "bool" | "person" | "setter" | "client" | "stage" | "role" | "candidate";
interface FieldDef {
  col: string;
  kind: Kind;
  values?: readonly string[];
  /** bool filters that are not a plain column */
  special?: "unassigned" | "no_manager" | "overdue_invoice" | "overdue_task";
}
interface EditDef extends FieldDef {
  append?: boolean; // text appended to a notes-style column
  managerOnly?: boolean;
  min?: number;
  max?: number;
  decimals?: boolean; // money: keep pennies instead of rounding to whole numbers
}
interface EntityDef {
  table: string;
  area: Area | null;
  label: string; // plural
  select: string;
  dateCol: string;
  order: { col: string; asc: boolean };
  name: (r: Row) => string;
  detail: (r: Row) => string;
  href: (r: Row) => string | undefined;
  filters: Record<string, FieldDef>;
  editable: Record<string, EditDef>;
  logAs?: "lead" | "client" | "concern";
  /** For logging on the client's timeline when the record isn't the client itself. */
  clientCol?: string;
  /** Column holding the person who "owns" a record (bulk tasks: "assign to their owner"). */
  ownerCol?: string;
  /** Column holding an email to write to (bulk email). */
  emailCol?: string;
}

const keys = (o: Record<string, unknown>) => Object.keys(o);
const clientName = (r: Row) => ((r.clients as { name?: string } | null)?.name ?? "") as string;

export const ENTITIES: Record<EntityKey, EntityDef> = {
  leads: {
    table: "leads",
    area: "leads",
    label: "leads",
    select: "id, name, email, phone, status, service, source, country, setter_id, received_at, ad_code, notes, client_id",
    dateCol: "received_at",
    order: { col: "received_at", asc: false },
    name: (r) => (r.name as string) || (r.email as string) || "Unnamed lead",
    detail: (r) => [r.service, LEAD_STATUS[r.status as keyof typeof LEAD_STATUS]?.label, r.source, String(r.received_at ?? "").slice(0, 10)].filter(Boolean).join(" · "),
    href: (r) => `/leads/${r.id}`,
    filters: {
      name: { col: "name", kind: "text" },
      email: { col: "email", kind: "text" },
      phone: { col: "phone", kind: "text" },
      status: { col: "status", kind: "enum", values: keys(LEAD_STATUS) },
      service: { col: "service", kind: "enum", values: ["ai", "va", "premium", "unknown"] },
      source: { col: "source", kind: "text" },
      country: { col: "country", kind: "text" },
      setter: { col: "setter_id", kind: "setter" },
      ad_code: { col: "ad_code", kind: "text" },
      unassigned: { col: "setter_id", kind: "bool", special: "unassigned" },
      received: { col: "received_at", kind: "date" },
    },
    editable: {
      status: { col: "status", kind: "enum", values: keys(LEAD_STATUS) },
      setter: { col: "setter_id", kind: "setter" },
      note: { col: "notes", kind: "text", append: true },
      country: { col: "country", kind: "text" },
      ad_name: { col: "ad_name", kind: "text" },
      ad_code: { col: "ad_code", kind: "text" },
      name: { col: "name", kind: "text" },
      email: { col: "email", kind: "text" },
      phone: { col: "phone", kind: "text" },
      service: { col: "service", kind: "enum", values: ["ai", "va", "premium", "unknown"] },
      source: { col: "source", kind: "text" },
    },
    ownerCol: "setter_id",
    emailCol: "email",
    logAs: "lead",
  },
  clients: {
    table: "clients",
    area: "clients",
    label: "clients",
    select: "id, name, company_name, status, pipeline, country, source, manager_id, stage_id, start_date, contact_email, created_at, remarks, daily_rate",
    dateCol: "created_at",
    order: { col: "name", asc: true },
    name: (r) => (r.name as string) || "Client",
    detail: (r) => [r.pipeline === "ai" ? "AI receptionist" : "VA", CLIENT_STATUS[r.status as keyof typeof CLIENT_STATUS]?.label, r.country].filter(Boolean).join(" · "),
    href: (r) => `/clients/${r.id}`,
    filters: {
      name: { col: "name", kind: "text" },
      status: { col: "status", kind: "enum", values: keys(CLIENT_STATUS) },
      service: { col: "pipeline", kind: "enum", values: ["ai", "va"] },
      country: { col: "country", kind: "text" },
      source: { col: "source", kind: "text" },
      manager: { col: "manager_id", kind: "person" },
      no_manager: { col: "manager_id", kind: "bool", special: "no_manager" },
      stage: { col: "stage_id", kind: "stage" },
      start_date: { col: "start_date", kind: "date" },
      created: { col: "created_at", kind: "date" },
    },
    editable: {
      name: { col: "name", kind: "text" },
      company_name: { col: "company_name", kind: "text" },
      contact_email: { col: "contact_email", kind: "text" },
      industry: { col: "industry", kind: "text" },
      closed_by: { col: "closed_by", kind: "text" },
      demo_call_date: { col: "demo_call_date", kind: "date" },
      portal_url: { col: "portal_url", kind: "text" },
      setup_fee: { col: "setup_fee", kind: "number", min: 0, max: 1_000_000, decimals: true, managerOnly: true },
      daily_rate: { col: "daily_rate", kind: "number", min: 0, max: 100_000, decimals: true, managerOnly: true },
      hiring_fee_status: { col: "hiring_fee_status", kind: "enum", values: keys(HIRING_FEE_STATUS), managerOnly: true },
      status: { col: "status", kind: "enum", values: keys(CLIENT_STATUS) },
      manager: { col: "manager_id", kind: "person" },
      country: { col: "country", kind: "text" },
      source: { col: "source", kind: "text" },
      start_date: { col: "start_date", kind: "date" },
      remark: { col: "remarks", kind: "text", append: true },
      checkin_every_days: { col: "checkin_every_days", kind: "number", min: 3, max: 90 },
      checkin_paused: { col: "checkin_paused", kind: "bool" },
    },
    logAs: "client",
    ownerCol: "manager_id",
    emailCol: "contact_email",
  },
  invoices: {
    table: "invoices",
    area: "payments",
    label: "invoices",
    select: "id, number, amount, currency, due_on, status, paid_on, client_id, notes, clients(name)",
    dateCol: "due_on",
    order: { col: "due_on", asc: true },
    name: (r) => `${clientName(r) || "Client"} · ${r.number}`,
    detail: (r) => `${formatMoney(Number(r.amount), r.currency as string)} · ${r.status} · due ${r.due_on}`,
    href: (r) => `/payments/${r.id}`,
    filters: {
      number: { col: "number", kind: "text" },
      status: { col: "status", kind: "enum", values: ["open", "paid", "void"] },
      client: { col: "client_id", kind: "client" },
      currency: { col: "currency", kind: "enum", values: ["GBP", "EUR", "NZD", "AUD", "CAD", "USD"] },
      amount: { col: "amount", kind: "number" },
      due: { col: "due_on", kind: "date" },
      overdue: { col: "due_on", kind: "bool", special: "overdue_invoice" },
    },
    editable: {
      status: { col: "status", kind: "enum", values: ["open", "paid", "void"], managerOnly: true },
      due_on: { col: "due_on", kind: "date", managerOnly: true },
      note: { col: "notes", kind: "text", append: true, managerOnly: true },
      amount: { col: "amount", kind: "number", min: 0.01, max: 1_000_000, decimals: true, managerOnly: true },
      currency: { col: "currency", kind: "enum", values: ["GBP", "EUR", "NZD", "AUD", "CAD", "USD"], managerOnly: true },
    },
    logAs: "client",
    clientCol: "client_id",
  },
  candidates: {
    table: "candidates",
    area: "candidates",
    label: "candidates",
    select: "id, full_name, email, status, ai_recommended_role, ai_score, applied_role, created_at, notes",
    dateCol: "created_at",
    order: { col: "created_at", asc: false },
    name: (r) => (r.full_name as string) || "Candidate",
    detail: (r) => [r.ai_recommended_role, r.ai_score != null ? `${r.ai_score}%` : null, CANDIDATE_STATUS[r.status as keyof typeof CANDIDATE_STATUS]?.label].filter(Boolean).join(" · "),
    href: (r) => `/candidates/${r.id}`,
    filters: {
      name: { col: "full_name", kind: "text" },
      email: { col: "email", kind: "text" },
      status: { col: "status", kind: "enum", values: keys(CANDIDATE_STATUS) },
      role: { col: "ai_recommended_role", kind: "text" },
      applied_role: { col: "applied_role", kind: "text" },
      score: { col: "ai_score", kind: "number" },
      created: { col: "created_at", kind: "date" },
    },
    editable: {
      status: { col: "status", kind: "enum", values: keys(CANDIDATE_STATUS) },
      note: { col: "notes", kind: "text", append: true },
      role: { col: "ai_recommended_role", kind: "text" },
      email: { col: "email", kind: "text" },
      phone: { col: "phone", kind: "text" },
    },
    emailCol: "email",
  },
  checkins: {
    table: "checkins",
    area: "checkins",
    label: "check-ins",
    select: "id, kind, status, mood, due_on, contact_name, contact_email, client_id, clients(name)",
    dateCol: "due_on",
    order: { col: "due_on", asc: true },
    name: (r) => `${clientName(r) || "Client"}${r.kind === "va" ? ` · VA ${r.contact_name ?? ""}` : ""}`,
    detail: (r) => [CHECKIN_STATUS[r.status as keyof typeof CHECKIN_STATUS]?.label, r.mood ? CHECKIN_MOOD[r.mood as keyof typeof CHECKIN_MOOD]?.label : null, `due ${r.due_on}`].filter(Boolean).join(" · "),
    href: () => "/check-ins",
    filters: {
      status: { col: "status", kind: "enum", values: keys(CHECKIN_STATUS) },
      mood: { col: "mood", kind: "enum", values: keys(CHECKIN_MOOD) },
      kind: { col: "kind", kind: "enum", values: ["client", "va"] },
      client: { col: "client_id", kind: "client" },
      due: { col: "due_on", kind: "date" },
    },
    editable: {
      status: { col: "status", kind: "enum", values: ["due", "done", "skipped"] },
      due_on: { col: "due_on", kind: "date" },
      channel: { col: "channel", kind: "enum", values: ["email", "whatsapp", "call"] },
    },
    clientCol: "client_id",
  },
  concerns: {
    table: "concerns",
    area: "clients",
    label: "concerns",
    select: "id, title, severity, status, client_id, owner_id, raised_at, clients(name)",
    dateCol: "raised_at",
    order: { col: "raised_at", asc: false },
    name: (r) => `${clientName(r) || "Client"} · ${r.title}`,
    detail: (r) => `${r.severity} · ${String(r.status).replace("_", " ")} · ${String(r.raised_at ?? "").slice(0, 10)}`,
    href: (r) => `/concerns/${r.id}`,
    filters: {
      title: { col: "title", kind: "text" },
      status: { col: "status", kind: "enum", values: ["open", "in_progress", "resolved"] },
      severity: { col: "severity", kind: "enum", values: ["low", "medium", "high", "urgent"] },
      client: { col: "client_id", kind: "client" },
      owner: { col: "owner_id", kind: "person" },
      raised: { col: "raised_at", kind: "date" },
    },
    editable: {
      status: { col: "status", kind: "enum", values: ["open", "in_progress", "resolved"] },
      severity: { col: "severity", kind: "enum", values: ["low", "medium", "high", "urgent"] },
      owner: { col: "owner_id", kind: "person" },
      title: { col: "title", kind: "text" },
    },
    logAs: "concern",
    ownerCol: "owner_id",
  },
  tasks: {
    table: "tasks",
    area: null,
    label: "tasks",
    select: "id, title, status, due_date, assignee_id, client_id, clients(name)",
    dateCol: "due_date",
    order: { col: "due_date", asc: true },
    name: (r) => (r.title as string) || "Task",
    detail: (r) => [clientName(r), r.status, r.due_date ? `due ${r.due_date}` : "no due date"].filter(Boolean).join(" · "),
    href: (r) => (r.client_id ? `/clients/${r.client_id}` : "/my-desk"),
    filters: {
      title: { col: "title", kind: "text" },
      status: { col: "status", kind: "enum", values: ["open", "done"] },
      assignee: { col: "assignee_id", kind: "person" },
      client: { col: "client_id", kind: "client" },
      due: { col: "due_date", kind: "date" },
      overdue: { col: "due_date", kind: "bool", special: "overdue_task" },
    },
    editable: {
      status: { col: "status", kind: "enum", values: ["open", "done"] },
      assignee: { col: "assignee_id", kind: "person" },
      due_date: { col: "due_date", kind: "date" },
      title: { col: "title", kind: "text" },
    },
    ownerCol: "assignee_id",
  },
  vas: {
    table: "va_placements",
    area: "clients",
    label: "VAs",
    select: "id, va_name, va_email, role, placement_status, start_date, end_date, hourly_rate, rate_currency, hours_per_week, client_id, checkin_paused, notes, created_at, clients(name)",
    dateCol: "created_at",
    order: { col: "va_name", asc: true },
    name: (r) => `${(r.va_name as string) || "VA"}${clientName(r) ? ` · ${clientName(r)}` : ""}`,
    detail: (r) => [r.role, PLACEMENT_STATUS[r.placement_status as keyof typeof PLACEMENT_STATUS]?.label, r.start_date ? `since ${r.start_date}` : null, r.hourly_rate != null ? `${r.rate_currency} ${r.hourly_rate}/h` : null].filter(Boolean).join(" · "),
    href: (r) => `/clients/${r.client_id}`,
    filters: {
      name: { col: "va_name", kind: "text" },
      email: { col: "va_email", kind: "text" },
      client: { col: "client_id", kind: "client" },
      role: { col: "role", kind: "text" },
      status: { col: "placement_status", kind: "enum", values: keys(PLACEMENT_STATUS) },
      start_date: { col: "start_date", kind: "date" },
      rate: { col: "hourly_rate", kind: "number" },
      hours: { col: "hours_per_week", kind: "number" },
      checkin_paused: { col: "checkin_paused", kind: "bool" },
    },
    editable: {
      status: { col: "placement_status", kind: "enum", values: keys(PLACEMENT_STATUS) },
      role: { col: "role", kind: "text" },
      hourly_rate: { col: "hourly_rate", kind: "number", min: 0, max: 1000, decimals: true },
      rate_currency: { col: "rate_currency", kind: "enum", values: ["GBP", "EUR", "NZD", "AUD", "CAD", "USD", "PHP"] },
      hours_per_week: { col: "hours_per_week", kind: "number", min: 1, max: 80 },
      start_date: { col: "start_date", kind: "date" },
      end_date: { col: "end_date", kind: "date" },
      checkin_paused: { col: "checkin_paused", kind: "bool" },
      checkin_every_days: { col: "checkin_every_days", kind: "number", min: 3, max: 90 },
      email: { col: "va_email", kind: "text" },
      note: { col: "notes", kind: "text", append: true },
    },
    logAs: "client",
    clientCol: "client_id",
    emailCol: "va_email",
  },
  roles: {
    table: "va_roles",
    area: "candidates",
    label: "roles",
    select: "id, title, status, priority, headcount, start_by, owner_id, client_id, budget, created_at",
    dateCol: "created_at",
    order: { col: "created_at", asc: false },
    name: (r) => (r.title as string) || "Role",
    detail: (r) => [ROLE_STATUS[r.status as keyof typeof ROLE_STATUS]?.label, r.priority !== "normal" ? r.priority : null, r.start_by ? `start by ${r.start_by}` : null].filter(Boolean).join(" · "),
    href: (r) => `/roles/${r.id}`,
    filters: {
      title: { col: "title", kind: "text" },
      status: { col: "status", kind: "enum", values: keys(ROLE_STATUS) },
      priority: { col: "priority", kind: "enum", values: keys(ROLE_PRIORITY) },
      recruiter: { col: "owner_id", kind: "person" },
      client: { col: "client_id", kind: "client" },
      start_by: { col: "start_by", kind: "date" },
      created: { col: "created_at", kind: "date" },
    },
    editable: {
      status: { col: "status", kind: "enum", values: keys(ROLE_STATUS) },
      priority: { col: "priority", kind: "enum", values: keys(ROLE_PRIORITY) },
      recruiter: { col: "owner_id", kind: "person" },
      start_by: { col: "start_by", kind: "date" },
      headcount: { col: "headcount", kind: "number", min: 1, max: 50 },
      hours_per_week: { col: "hours_per_week", kind: "number", min: 1, max: 80 },
      budget: { col: "budget", kind: "text" },
      title: { col: "title", kind: "text" },
    },
    ownerCol: "owner_id",
  },
  role_candidates: {
    table: "va_role_candidates",
    area: "candidates",
    label: "role candidates",
    select: "id, stage, match_score, role_id, candidate_id, created_at, notes, candidates(full_name, email), va_roles(title)",
    dateCol: "created_at",
    order: { col: "match_score", asc: false },
    name: (r) => `${(r.candidates as { full_name?: string } | null)?.full_name ?? "Candidate"} · ${(r.va_roles as { title?: string } | null)?.title ?? "role"}`,
    detail: (r) => [ROLE_STAGE[r.stage as keyof typeof ROLE_STAGE]?.label, r.match_score != null ? `${r.match_score}% fit` : null].filter(Boolean).join(" · "),
    href: (r) => `/roles/${r.role_id}`,
    filters: {
      stage: { col: "stage", kind: "enum", values: keys(ROLE_STAGE) },
      role: { col: "role_id", kind: "role" },
      candidate: { col: "candidate_id", kind: "candidate" },
      score: { col: "match_score", kind: "number" },
      added: { col: "created_at", kind: "date" },
    },
    editable: {
      // hiring creates a placement, so it goes through propose_hire, not here
      stage: { col: "stage", kind: "enum", values: ["suggested", "shortlisted", "interview", "offered", "rejected"] },
      note: { col: "notes", kind: "text", append: true },
    },
  },
};

/** Most records one bulk change may touch (the confirm card always shows the count). */
export const BULK_MAX = 1000;

export interface Filter {
  field: string;
  op: string; // is | is_not | contains | before | after | on_or_before | on_or_after | more_than | less_than | is_empty | is_not_empty | is_true | is_false
  value: string;
}

export const PERIODS = ["any", "today", "yesterday", "last_7_days", "this_week", "this_month", "last_30_days", "next_7_days"] as const;

function periodRange(p: string): { from?: string; to?: string; label: string } {
  const t = dublinDate();
  switch (p) {
    case "today":
      return { from: t, to: t, label: "today" };
    case "yesterday":
      return { from: addDays(t, -1), to: addDays(t, -1), label: "yesterday" };
    case "last_7_days":
      return { from: addDays(t, -6), to: t, label: "the last 7 days" };
    case "this_week": {
      const dow = (new Date(`${t}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
      return { from: addDays(t, -dow), to: t, label: "this week" };
    }
    case "this_month":
      return { from: t.slice(0, 8) + "01", to: t, label: "this month" };
    case "last_30_days":
      return { from: addDays(t, -29), to: t, label: "the last 30 days" };
    case "next_7_days":
      return { from: t, to: addDays(t, 7), label: "the next 7 days" };
    default:
      return { label: "" };
  }
}

/** Resolve a human value (name, "me", stage name) to ids. Returns null when nothing matches. */
async function resolveRef(db: Db, kind: Kind, value: string, meId: string): Promise<string[] | null> {
  const v = value.replace(/[%,()*]/g, " ").trim();
  if (!v) return null;
  if (kind === "person") {
    if (/^(me|myself|mine)$/i.test(v)) return [meId];
    const { data } = await db.from("profiles").select("id").or(`full_name.ilike.%${v}%,email.ilike.%${v}%`).limit(10);
    return data?.length ? data.map((x) => x.id as string) : null;
  }
  if (kind === "setter") {
    const { data } = await db.from("setters").select("id").ilike("name", `%${v}%`).limit(10);
    return data?.length ? data.map((x) => x.id as string) : null;
  }
  if (kind === "client") {
    const { data } = await db.from("clients").select("id").or(`name.ilike.%${v}%,company_name.ilike.%${v}%`).limit(50);
    return data?.length ? data.map((x) => x.id as string) : null;
  }
  if (kind === "role") {
    const { data } = await db.from("va_roles").select("id").ilike("title", `%${v}%`).limit(20);
    return data?.length ? data.map((x) => x.id as string) : null;
  }
  if (kind === "candidate") {
    const { data } = await db.from("candidates").select("id").ilike("full_name", `%${v}%`).limit(20);
    return data?.length ? data.map((x) => x.id as string) : null;
  }
  if (kind === "stage") {
    const { data } = await db.from("pipeline_stages").select("id").ilike("name", `%${v}%`).limit(10);
    return data?.length ? data.map((x) => x.id as string) : null;
  }
  return [v];
}

/** Dates on timestamp columns are compared against the Dublin day bounds. */
const isTimestamp = (col: string) => /_at$/.test(col);
function dayStart(col: string, d: string) {
  return isTimestamp(col) ? dublinDayBounds(d).start : d;
}
function dayEnd(col: string, d: string) {
  return isTimestamp(col) ? dublinDayBounds(d).end : d;
}

// Supabase query builders are heavily generic; filters are applied dynamically here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Q = any;

/** Apply the model's filters to a query. Unknown fields are reported back, not ignored silently. */
async function applyFilters(db: Db, ent: EntityDef, q: Q, filters: Filter[], period: string, meId: string): Promise<{ q: Q; problems: string[] }> {
  const problems: string[] = [];
  const today = dublinDate();
  for (const f of filters ?? []) {
    const def = ent.filters[f.field];
    if (!def) {
      problems.push(`unknown field "${f.field}" (use: ${keys(ent.filters).join(", ")})`);
      continue;
    }
    const op = String(f.op || "is");
    const val = String(f.value ?? "").trim();
    if (def.special) {
      const on = !/^(false|no|0)$/i.test(val) && op !== "is_false";
      if (def.special === "unassigned") q = on ? q.is("setter_id", null) : q.not("setter_id", "is", null);
      if (def.special === "no_manager") q = on ? q.is("manager_id", null) : q.not("manager_id", "is", null);
      if (def.special === "overdue_invoice") q = on ? q.eq("status", "open").lt("due_on", today) : q.or(`status.neq.open,due_on.gte.${today}`);
      if (def.special === "overdue_task") q = on ? q.eq("status", "open").lt("due_date", today) : q;
      continue;
    }
    if (op === "is_empty") {
      q = q.is(def.col, null);
      continue;
    }
    if (op === "is_not_empty") {
      q = q.not(def.col, "is", null);
      continue;
    }
    if (def.kind === "bool") {
      q = q.eq(def.col, !/^(false|no|0)$/i.test(val) && op !== "is_false");
      continue;
    }
    if (["person", "setter", "client", "stage", "role", "candidate"].includes(def.kind)) {
      const ids = await resolveRef(db, def.kind, val, meId);
      if (!ids) {
        problems.push(`nothing matches ${f.field} "${val}"`);
        q = q.in(def.col, ["00000000-0000-0000-0000-000000000000"]);
      } else q = op === "is_not" ? q.not(def.col, "in", `(${ids.join(",")})`) : q.in(def.col, ids);
      continue;
    }
    if (def.kind === "date") {
      if (!isIsoDate(val)) {
        problems.push(`${f.field} needs a YYYY-MM-DD date`);
        continue;
      }
      if (op === "before") q = q.lt(def.col, dayStart(def.col, val));
      else if (op === "after") q = q.gte(def.col, dayEnd(def.col, val));
      else if (op === "on_or_before") q = q.lt(def.col, dayEnd(def.col, val));
      else if (op === "on_or_after") q = q.gte(def.col, dayStart(def.col, val));
      else q = isTimestamp(def.col) ? q.gte(def.col, dayStart(def.col, val)).lt(def.col, dayEnd(def.col, val)) : q.eq(def.col, val);
      continue;
    }
    if (def.kind === "number") {
      const n = Number(val);
      if (!Number.isFinite(n)) {
        problems.push(`${f.field} needs a number`);
        continue;
      }
      if (op === "more_than") q = q.gt(def.col, n);
      else if (op === "less_than") q = q.lt(def.col, n);
      else q = q.eq(def.col, n);
      continue;
    }
    if (def.kind === "enum") {
      const v = val.toLowerCase().replace(/\s+/g, "_");
      const vals = v.split("|").filter((x) => def.values?.includes(x) || def.values?.includes(x.toUpperCase()));
      const norm = vals.map((x) => (def.values?.includes(x) ? x : x.toUpperCase()));
      if (!norm.length) {
        problems.push(`${f.field} must be one of ${def.values?.join(", ")}`);
        continue;
      }
      q = op === "is_not" ? q.not(def.col, "in", `(${norm.join(",")})`) : q.in(def.col, norm);
      continue;
    }
    // text
    const t = val.replace(/[%,()*]/g, " ").trim();
    if (!t) continue;
    q = op === "is" ? q.ilike(def.col, t) : op === "is_not" ? q.not(def.col, "ilike", `%${t}%`) : q.ilike(def.col, `%${t}%`);
  }
  const pr = periodRange(period);
  if (pr.from) q = q.gte(ent.dateCol, dayStart(ent.dateCol, pr.from));
  if (pr.to) q = q.lt(ent.dateCol, dayEnd(ent.dateCol, pr.to));
  return { q, problems };
}

export interface SearchResult {
  rows: Row[];
  count: number;
  problems: string[];
  periodLabel: string;
}

export async function searchRecords(
  entity: EntityKey,
  filters: Filter[],
  period: string,
  meId: string,
  opts: { limit?: number; sort?: string; sortDir?: "asc" | "desc"; bulk?: boolean } = {},
): Promise<SearchResult> {
  const db = await getServerSupabase();
  const ent = ENTITIES[entity];
  const sortCol = opts.sort && (ent.filters[opts.sort]?.col ?? null) ? ent.filters[opts.sort].col : ent.order.col;
  const asc = opts.sortDir ? opts.sortDir === "asc" : ent.order.asc;
  let q: Q = db.from(ent.table).select(ent.select, { count: "exact" }).order(sortCol, { ascending: asc, nullsFirst: false });
  const applied = await applyFilters(db, ent, q, filters, period, meId);
  q = applied.q.limit(Math.min(Math.max(opts.limit ?? 50, 1), opts.bulk ? BULK_MAX : 200));
  const { data, count, error } = await q;
  if (error) applied.problems.push(error.message);
  return { rows: (data ?? []) as Row[], count: count ?? (data ?? []).length, problems: applied.problems, periodLabel: periodRange(period).label };
}

export interface ResolvedChange {
  field: string;
  value: string | number | boolean | null; // stored value (ids already resolved)
  display: string; // what the user sees
}

/** Validate + resolve the requested field changes for an entity. */
export async function resolveChanges(entity: EntityKey, set: { field: string; value: string }[], meId: string): Promise<{ changes: ResolvedChange[]; problems: string[] }> {
  const db = await getServerSupabase();
  const ent = ENTITIES[entity];
  const changes: ResolvedChange[] = [];
  const problems: string[] = [];
  for (const s of set ?? []) {
    const def = ent.editable[s.field];
    if (!def) {
      problems.push(`can't change "${s.field}" on ${ent.label} (can change: ${keys(ent.editable).join(", ")})`);
      continue;
    }
    const raw = String(s.value ?? "").trim();
    if (def.kind === "enum") {
      const v = raw.toLowerCase().replace(/\s+/g, "_");
      if (!def.values?.includes(v)) problems.push(`${s.field} must be one of ${def.values?.join(", ")}`);
      else changes.push({ field: s.field, value: v, display: v.replace(/_/g, " ") });
    } else if (def.kind === "person" || def.kind === "setter") {
      if (/^(nobody|none|no one|unassign(ed)?)$/i.test(raw)) {
        changes.push({ field: s.field, value: null, display: "Unassigned" });
        continue;
      }
      const ids = await resolveRef(db, def.kind, raw, meId);
      if (!ids) problems.push(`no ${def.kind === "setter" ? "setter" : "team member"} called "${raw}"`);
      else if (ids.length > 1) problems.push(`"${raw}" matches more than one person, please be more specific`);
      else {
        const table = def.kind === "setter" ? "setters" : "profiles";
        const col = def.kind === "setter" ? "name" : "full_name";
        const { data } = await db.from(table).select(col).eq("id", ids[0]).maybeSingle();
        changes.push({ field: s.field, value: ids[0], display: ((data as Row | null)?.[col] as string) || raw });
      }
    } else if (def.kind === "date") {
      if (!isIsoDate(raw)) problems.push(`${s.field} needs a YYYY-MM-DD date`);
      else changes.push({ field: s.field, value: raw, display: raw });
    } else if (def.kind === "number") {
      const num = Number(raw.replace(/[£€$,\s]/g, ""));
      const n = def.decimals ? Math.round(num * 100) / 100 : Math.round(num);
      if (!Number.isFinite(n) || (def.min != null && n < def.min) || (def.max != null && n > def.max)) problems.push(`${s.field} must be a number${def.min != null ? ` from ${def.min} to ${def.max}` : ""}`);
      else changes.push({ field: s.field, value: n, display: String(n) });
    } else if (def.kind === "bool") {
      const b = /^(true|yes|on|1|paused)$/i.test(raw);
      changes.push({ field: s.field, value: b, display: b ? "yes" : "no" });
    } else {
      const t = raw.slice(0, 2000);
      if (!t) problems.push(`${s.field} is empty`);
      else changes.push({ field: s.field, value: t, display: def.append ? `add "${t}"` : t });
    }
  }
  return { changes, problems };
}

export function summarise(entity: EntityKey, rows: Row[], max = 15) {
  const ent = ENTITIES[entity];
  return rows.slice(0, max).map((r) => ({ title: ent.name(r), detail: ent.detail(r), href: ent.href(r) }));
}
