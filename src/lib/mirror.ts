/**
 * Read-only copies of the team's Google Sheet tabs (sheet_mirror). Pure helpers
 * shared by the sync route and the pages. Cell shape sent by the sync script:
 *   row  = [sheetRowNumber, cell, cell, ...]
 *   cell = null (empty) | "text" | [text, styleIndex] | [text, styleIndex, note]
 * Style indexes point into the part's own `styles` list.
 */

export type MirrorStyle = {
  bg?: string; // background colour (#rrggbb), white is left out
  fg?: string; // text colour
  b?: 1; // bold
  i?: 1; // italic
  a?: "c" | "r"; // horizontal alignment (left is the default)
};
export type MirrorCellRaw = null | string | [string, number] | [string, number, string];
export type MirrorRowRaw = [number, ...MirrorCellRaw[]];

/** A cell ready to draw: text, its style and an optional cell note. */
export type MirrorCell = { v: string; s: MirrorStyle | null; n: string };
export type MirrorRow = { num: number; cells: MirrorCell[] };

export type MirrorMeta = {
  key: string;
  department: string;
  area: string;
  label: string;
  position: number;
  source_name: string;
  source_url: string;
  frozen_rows: number;
  frozen_cols: number;
  col_widths: number[];
  merges: [number, number, number, number][]; // [row0, col0, rowSpan, colSpan] in this copy's own row/col indexes
  row_count: number;
  col_count: number;
  parts: number;
  sync_id: string;
  synced_at: string;
};

export type MirrorGrid = { meta: MirrorMeta; rows: MirrorRow[] };

const EMPTY: MirrorCell = { v: "", s: null, n: "" };

/** Turns the uploaded parts (in order) into rows of drawable cells. */
export function assembleRows(parts: { styles: unknown; rows: unknown }[]): MirrorRow[] {
  const out: MirrorRow[] = [];
  for (const p of parts) {
    const styles = Array.isArray(p.styles) ? (p.styles as MirrorStyle[]) : [];
    const rows = Array.isArray(p.rows) ? (p.rows as unknown[]) : [];
    for (const r of rows) {
      if (!Array.isArray(r) || typeof r[0] !== "number") continue;
      const cells = r.slice(1).map((c): MirrorCell => {
        if (c === null || c === undefined) return EMPTY;
        if (typeof c === "string") return { v: c, s: null, n: "" };
        if (Array.isArray(c)) {
          const st = typeof c[1] === "number" ? styles[c[1]] ?? null : null;
          return { v: String(c[0] ?? ""), s: st, n: typeof c[2] === "string" ? c[2] : "" };
        }
        return { v: String(c), s: null, n: "" };
      });
      out.push({ num: r[0], cells });
    }
  }
  return out;
}

/** Checks one uploaded part enough to store it safely (the page re-checks when drawing). */
export function validRows(rows: unknown): rows is MirrorRowRaw[] {
  return Array.isArray(rows) && rows.every((r) => Array.isArray(r) && typeof r[0] === "number");
}

export const cellText = (c: MirrorCell | undefined) => (c ? c.v.trim() : "");

/** Money in any of the sheet's formats ("EUR €1,234.56", "£8.50", "-€20") as a number. */
export function money(v: string): number {
  const s = String(v ?? "").replace(/[^0-9.\-]/g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

export const euro = (n: number) =>
  "€" + n.toLocaleString("en-IE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// ---------------------------------------------------------------------------
// Accounts › Collections, read from Customer Payments › " Client VA Payments".
// The tab is one long list: a marker row ("1-15 October 2026" in the VA Name
// column, no client) starts each pay-run, and every row under it is one VA.
// ---------------------------------------------------------------------------

export type PayStatus = "Paid" | "Part paid" | "Unpaid" | "Not invoiced";
export type PayLine = {
  row: number;
  client: string;
  va: string;
  country: string;
  remark: string; // column A ("GBP will send after cut off", ...)
  invoice: number;
  received: number;
  datePaid: string;
  xero: string;
  notes: string;
  sheetStatus: string; // PAYMENT STATUS column, when Maria fills it
  status: PayStatus;
};
export type PayRun = { label: string; month: string; lines: PayLine[]; invoiced: number; received: number };

const RUN_RE = /^\s*\d{1,2}\s*-\s*\d{1,2}\s+([A-Za-z]+)\s+(\d{4})\s*$/;

export function parsePayRuns(rows: MirrorRow[]): PayRun[] {
  const hi = rows.findIndex((r) => {
    const t = r.cells.map((c) => c.v.trim().toLowerCase());
    return t.includes("client name") && t.includes("va name");
  });
  if (hi < 0) return [];
  const head = rows[hi].cells.map((c) => c.v.trim().toLowerCase().replace(/\s+/g, " "));
  const find = (re: RegExp) => head.findIndex((h) => re.test(h));
  const col = {
    client: find(/^client name$/),
    va: find(/^va name$/),
    country: find(/^country$/),
    invoice: find(/^total invoice amount/),
    received: find(/^payment received/),
    datePaid: find(/^date paid$/),
    xero: find(/^xero inv/),
    status: find(/^payment status$/),
  };
  if (col.client < 0 || col.va < 0 || col.invoice < 0) return [];
  // the notes column has its title in the row above the header ("REMARKS/NOTES")
  const above = hi > 0 ? rows[hi - 1].cells.map((c) => c.v.trim().toLowerCase()) : [];
  const notesCol = above.findIndex((h) => h.startsWith("remarks"));
  const get = (r: MirrorRow, i: number) => (i >= 0 ? cellText(r.cells[i]) : "");

  const runs: PayRun[] = [];
  for (const r of rows.slice(hi + 1)) {
    const client = get(r, col.client);
    const vaCell = get(r, col.va);
    const m = !client ? vaCell.match(RUN_RE) : null;
    if (m) {
      runs.push({ label: vaCell.replace(/\s+/g, " "), month: `${m[1]} ${m[2]}`, lines: [], invoiced: 0, received: 0 });
      continue;
    }
    if (!client || !runs.length) continue;
    const invoice = money(get(r, col.invoice));
    const receivedText = get(r, col.received);
    const received = money(receivedText);
    const status: PayStatus =
      invoice <= 0 ? "Not invoiced" : !receivedText || received <= 0 ? "Unpaid" : received + 0.5 >= invoice ? "Paid" : "Part paid";
    const run = runs[runs.length - 1];
    run.lines.push({
      row: r.num,
      client,
      va: vaCell,
      country: get(r, col.country),
      remark: get(r, 0),
      invoice,
      received,
      datePaid: get(r, col.datePaid),
      xero: get(r, col.xero),
      notes: get(r, notesCol),
      sheetStatus: get(r, col.status),
      status,
    });
    run.invoiced += invoice;
    run.received += received;
  }
  return runs;
}

export const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);
