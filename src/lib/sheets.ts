/** Sheets: team spreadsheets inside the CRM. Pure helpers shared by server and browser. */

export const COLUMN_TYPES = ["text", "number", "money", "date", "select", "checkbox", "person", "url"] as const;
export type ColumnType = (typeof COLUMN_TYPES)[number];

export const COLUMN_TYPE_LABEL: Record<ColumnType, string> = {
  text: "Text",
  number: "Number",
  money: "Money",
  date: "Date",
  select: "Dropdown",
  checkbox: "Checkbox",
  person: "Person",
  url: "Link",
};

export const SHEET_VISIBILITY = ["private", "everyone", "departments", "people"] as const;
export type SheetVisibility = (typeof SHEET_VISIBILITY)[number];

export const VISIBILITY_LABEL: Record<SheetVisibility, string> = {
  private: "Only me",
  everyone: "Whole team",
  departments: "Departments",
  people: "Specific people",
};

export const SHEET_CURRENCIES = ["GBP", "EUR", "USD", "NZD", "AUD", "CAD", "PHP"] as const;

export interface ColumnOptions {
  choices?: string[];
  currency?: string;
}

export interface SheetColumn {
  id: string;
  sheet_id: string;
  name: string;
  type: ColumnType;
  options: ColumnOptions;
  position: number;
  width: number;
}

export type CellValue = string | number | boolean | null;

export interface SheetRow {
  id: string;
  sheet_id: string;
  position: number;
  cells: Record<string, CellValue>;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Sheet {
  id: string;
  name: string;
  description: string | null;
  emoji: string | null;
  visibility: SheetVisibility;
  departments: string[];
  people: string[];
  archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Colour chips for dropdown choices, picked by the choice's position. */
export const CHOICE_TONES = [
  "bg-brand-500/12 text-brand-700 ring-brand-500/25 dark:text-brand-300",
  "bg-emerald-500/12 text-emerald-700 ring-emerald-500/25 dark:text-emerald-300",
  "bg-accent-500/12 text-accent-600 ring-accent-500/25 dark:text-accent-400",
  "bg-violet-500/12 text-violet-700 ring-violet-500/25 dark:text-violet-300",
  "bg-rose-500/12 text-rose-700 ring-rose-500/25 dark:text-rose-300",
  "bg-cyan-500/12 text-cyan-700 ring-cyan-500/25 dark:text-cyan-300",
  "bg-amber-500/15 text-amber-700 ring-amber-500/25 dark:text-amber-300",
  "bg-slate-500/12 text-slate-700 ring-slate-500/25 dark:text-slate-300",
];

export function choiceTone(col: Pick<SheetColumn, "options">, value: string): string {
  const i = (col.options.choices ?? []).indexOf(value);
  return CHOICE_TONES[(i < 0 ? 7 : i) % CHOICE_TONES.length];
}

/** Turn typed/pasted text into the stored value for a column (null = empty). */
export function parseCell(type: ColumnType, raw: string): CellValue {
  const t = raw.trim();
  if (type === "checkbox") return /^(true|yes|y|1|x|✓|✔|done|on)$/i.test(t);
  if (t === "") return null;
  switch (type) {
    case "number":
    case "money": {
      const cleaned = t.replace(/\b(GBP|EUR|USD|NZD|AUD|CAD|PHP)\b/gi, "").replace(/[£€$₱,\s]/g, "");
      if (!/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?%?$/i.test(cleaned)) return null;
      const n = Number(cleaned.replace(/%$/, ""));
      return Number.isFinite(n) ? n : null;
    }
    case "date": {
      if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
      const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/); // dd/mm/yyyy (UK/IE/PH)
      if (m) {
        const y = m[3].length === 2 ? `20${m[3]}` : m[3];
        return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
      }
      const d = new Date(t);
      return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    }
    case "url":
      return /^https?:\/\//i.test(t) ? t.slice(0, 2000) : `https://${t}`.slice(0, 2000);
    default:
      return t.slice(0, 5000);
  }
}

const SYMBOL: Record<string, string> = { GBP: "£", EUR: "€", USD: "$", NZD: "NZ$", AUD: "A$", CAD: "C$", PHP: "₱" };

/** Display text for a value (also used for CSV export and copy). */
export function formatCell(
  col: Pick<SheetColumn, "type" | "options">,
  v: CellValue | undefined,
  people?: Map<string, string>,
): string {
  if (v === null || v === undefined || v === "") return "";
  switch (col.type) {
    case "checkbox":
      return v ? "✓" : "";
    case "number":
      return typeof v === "number" ? v.toLocaleString("en-GB", { maximumFractionDigits: 4 }) : String(v);
    case "money": {
      const cur = col.options.currency ?? "GBP";
      return typeof v === "number"
        ? `${SYMBOL[cur] ?? `${cur} `}${v.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
        : String(v);
    }
    case "date": {
      const s = String(v);
      const d = new Date(`${s}T12:00:00Z`);
      return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
    }
    case "person":
      return people?.get(String(v)) ?? "";
    default:
      return String(v);
  }
}

/** Raw text for editing / CSV (dates stay ISO, numbers unformatted). */
export function rawCell(col: Pick<SheetColumn, "type">, v: CellValue | undefined, people?: Map<string, string>): string {
  if (v === null || v === undefined) return "";
  if (col.type === "checkbox") return v ? "TRUE" : "FALSE";
  if (col.type === "person") return people?.get(String(v)) ?? "";
  return String(v);
}

/** Compare two values of a column for sorting (empties last). */
export function compareCells(col: Pick<SheetColumn, "type">, a: CellValue | undefined, b: CellValue | undefined): number {
  const ea = a === null || a === undefined || a === "";
  const eb = b === null || b === undefined || b === "";
  if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1;
  if (col.type === "number" || col.type === "money") return Number(a) - Number(b);
  if (col.type === "checkbox") return Number(Boolean(b)) - Number(Boolean(a));
  return String(a).localeCompare(String(b), "en", { numeric: true, sensitivity: "base" });
}

export function toCsv(columns: SheetColumn[], rows: SheetRow[], people: Map<string, string>): string {
  const esc = (s: string) => (/[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const lines = [columns.map((c) => esc(c.name)).join(",")];
  for (const r of rows) lines.push(columns.map((c) => esc(rawCell(c, r.cells[c.id], people))).join(","));
  return lines.join("\r\n");
}

/** Split text pasted from Google Sheets / Excel (tab separated, quoted cells allowed). */
export function parsePasted(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/\r\n?/g, "\n").replace(/\n$/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === "\t") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  rows.push(row);
  return rows;
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------
type TemplateColumn = { name: string; type: ColumnType; options?: ColumnOptions; width?: number };

export interface SheetTemplate {
  key: string;
  name: string;
  emoji: string;
  blurb: string;
  columns: TemplateColumn[];
  /** Example rows keyed by column name (person columns are filled with the creator). */
  sample?: Record<string, CellValue | "@me">[];
}

export const SHEET_TEMPLATES: SheetTemplate[] = [
  {
    key: "daily-kpis",
    name: "Daily KPIs",
    emoji: "📈",
    blurb: "One row per person per day: calls, conversations, bookings.",
    columns: [
      { name: "Date", type: "date", width: 140 },
      { name: "Who", type: "person", width: 160 },
      { name: "Calls made", type: "number", width: 120 },
      { name: "Conversations", type: "number", width: 130 },
      { name: "Booked calls", type: "number", width: 120 },
      { name: "New leads", type: "number", width: 120 },
      { name: "Hit target?", type: "checkbox", width: 110 },
      { name: "Notes", type: "text", width: 260 },
    ],
    sample: [{ Date: "@today", Who: "@me", "Calls made": 0, Conversations: 0, "Booked calls": 0, "New leads": 0 }],
  },
  {
    key: "experiments",
    name: "Experiments",
    emoji: "🧪",
    blurb: "Test ideas, owners, results and what we learned.",
    columns: [
      { name: "Experiment", type: "text", width: 240 },
      { name: "Hypothesis", type: "text", width: 260 },
      { name: "Owner", type: "person", width: 150 },
      { name: "Status", type: "select", options: { choices: ["Idea", "Running", "Won", "Lost", "Paused"] }, width: 130 },
      { name: "Start", type: "date", width: 130 },
      { name: "End", type: "date", width: 130 },
      { name: "Metric", type: "text", width: 160 },
      { name: "Result", type: "text", width: 200 },
      { name: "Learnings", type: "text", width: 260 },
    ],
    sample: [{ Experiment: "New Facebook ad hook", Owner: "@me", Status: "Idea" }],
  },
  {
    key: "content-calendar",
    name: "Content calendar",
    emoji: "🗓️",
    blurb: "Posts by date, channel and status.",
    columns: [
      { name: "Date", type: "date", width: 140 },
      { name: "Channel", type: "select", options: { choices: ["Facebook", "Instagram", "LinkedIn", "TikTok", "YouTube", "Email"] }, width: 140 },
      { name: "Topic", type: "text", width: 260 },
      { name: "Owner", type: "person", width: 150 },
      { name: "Status", type: "select", options: { choices: ["Idea", "Drafting", "Scheduled", "Posted"] }, width: 130 },
      { name: "Link", type: "url", width: 220 },
    ],
  },
  {
    key: "ad-spend",
    name: "Ad spend & leads",
    emoji: "💸",
    blurb: "Daily spend per campaign against leads and bookings.",
    columns: [
      { name: "Date", type: "date", width: 140 },
      { name: "Campaign", type: "text", width: 220 },
      { name: "Market", type: "select", options: { choices: ["UK", "IE", "NZ", "AU", "CA", "US"] }, width: 110 },
      { name: "Spend", type: "money", options: { currency: "GBP" }, width: 120 },
      { name: "Leads", type: "number", width: 100 },
      { name: "Booked", type: "number", width: 100 },
      { name: "Notes", type: "text", width: 240 },
    ],
  },
  {
    key: "va-hours",
    name: "VA hours log",
    emoji: "⏱️",
    blurb: "Hours worked per VA per week, for billing checks.",
    columns: [
      { name: "Week of", type: "date", width: 140 },
      { name: "VA", type: "text", width: 180 },
      { name: "Client", type: "text", width: 200 },
      { name: "Hours", type: "number", width: 100 },
      { name: "Rate", type: "money", options: { currency: "USD" }, width: 110 },
      { name: "Approved", type: "checkbox", width: 110 },
      { name: "Notes", type: "text", width: 240 },
    ],
  },
  {
    key: "blank",
    name: "Blank sheet",
    emoji: "📄",
    blurb: "Start from scratch and add your own columns.",
    columns: [
      { name: "Name", type: "text", width: 220 },
      { name: "Notes", type: "text", width: 280 },
      { name: "Done", type: "checkbox", width: 100 },
    ],
  },
];
