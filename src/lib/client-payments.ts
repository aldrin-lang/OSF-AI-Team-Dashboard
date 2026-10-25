/** Client payments (Accounts): pure helpers shared by the pages, the actions and the import. */

export type ClientPayment = {
  id: string;
  client_id: string;
  placement_id: string | null;
  va_name: string | null;
  period_label: string;
  period_start: string | null;
  period_end: string | null;
  hours: number | null;
  amount: number;
  currency: string;
  invoice_no: string | null;
  invoiced_on: string | null;
  due_on: string | null;
  paid_amount: number;
  paid_on: string | null;
  note: string | null;
  source_key: string | null;
  updated_at: string;
};

export const STAGES = ["for-invoice", "for-collection", "not-paid", "paid"] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABEL: Record<Stage, string> = {
  "for-invoice": "For invoice",
  "for-collection": "For collection",
  "not-paid": "Not paid yet",
  paid: "Paid",
};

/** Days after the period ends that a payment is due, when no due date is set. */
export const DEFAULT_DUE_DAYS = 7;

/**
 * Which Accounts tab a payment line is in, on a given day (YYYY-MM-DD, Dublin business date).
 * Must match public.client_payment_stage() in supabase/migrations/20261026000001_accounts_speed.sql.
 * An invoiced line with no due date stays in For collection; an invoiced zero line has nothing to collect.
 */
export function stageOf(p: Pick<ClientPayment, "amount" | "paid_amount" | "invoice_no" | "due_on">, today: string): Stage {
  const amount = Number(p.amount) || 0;
  const paid = Number(p.paid_amount) || 0;
  if (paid > 0 && paid + 0.005 >= amount) return "paid";
  if (!p.invoice_no?.trim()) return "for-invoice";
  if (amount <= 0) return "paid";
  if (p.due_on && p.due_on < today) return "not-paid";
  return "for-collection";
}

export const owedOf = (p: Pick<ClientPayment, "amount" | "paid_amount">) => Math.max((Number(p.amount) || 0) - (Number(p.paid_amount) || 0), 0);
export const isPartPaid = (p: Pick<ClientPayment, "amount" | "paid_amount">) => Number(p.paid_amount) > 0 && owedOf(p) > 0.005;

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const pad = (n: number) => String(n).padStart(2, "0");

/** "1-15 October 2026" / "16-31 Oct 2026" → first and last day (YYYY-MM-DD), or null. */
export function parsePeriod(label: string): { start: string; end: string } | null {
  const m = label.match(/(\d{1,2})\s*-\s*(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return null;
  const mi = MONTHS.findIndex((x) => x.startsWith(m[3].toLowerCase().slice(0, 3)));
  if (mi < 0) return null;
  const y = Number(m[4]);
  const last = new Date(Date.UTC(y, mi + 1, 0)).getUTCDate();
  // "16-31 September" is the team's shorthand for "to the end of the month": the end day is clamped
  const d1 = Number(m[1]);
  const d2 = Math.min(Number(m[2]), last);
  if (d1 < 1 || d1 > last || d2 < d1) return null;
  return { start: `${y}-${pad(mi + 1)}-${pad(d1)}`, end: `${y}-${pad(mi + 1)}-${pad(d2)}` };
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** A real calendar day (2026-02-31 is not). */
export function isCalendarDate(y: number, m: number, d: number): boolean {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** "25/10/2026", "10/25/2026" (when unambiguous), "2026-10-25", "Oct 25, 2026" → YYYY-MM-DD, or null. */
export function parseSheetDate(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return isCalendarDate(+m[1], +m[2], +m[3]) ? `${m[1]}-${pad(+m[2])}-${pad(+m[3])}` : null;
  m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/);
  if (m) {
    let [d, mo] = [+m[1], +m[2]];
    if (mo > 12 && d <= 12) [d, mo] = [mo, d];
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return isCalendarDate(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
}

/**
 * A money or hours amount typed by a person: "1234.5", "1,234.50", "€900.24" → number; anything
 * else ("abc", "10,50", "1e3", negative) → NaN, so a typo is rejected instead of saved as a wrong value.
 * Up to 2 decimals and below 10 billion (numeric(12,2)).
 */
export function parseAmount(v: string): number {
  let t = v.trim().replace(/^[€£$]\s*|^(EUR|GBP|USD|NZD|AUD|CAD)\s*/i, "");
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return NaN;
  const n = Number(t);
  return n < 1e10 ? n : NaN;
}

export const money = (n: number, currency = "EUR") =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency, minimumFractionDigits: 2 }).format(Number(n) || 0);

/** Amounts in more than one currency are never added together: "€1,200.00 + £300.00". */
export function moneyByCurrency(byCurrency: Record<string, number> | null | undefined): string {
  const parts = Object.entries(byCurrency ?? {})
    .filter(([, v]) => Math.abs(Number(v)) >= 0.005)
    .sort(([a], [b]) => (a === "EUR" ? -1 : b === "EUR" ? 1 : a.localeCompare(b)))
    .map(([c, v]) => money(Number(v), c));
  return parts.length ? parts.join(" + ") : money(0);
}

// ---------------------------------------------------------------------------
// Matching sheet client names to CRM clients ("Matt Hopely" = "Matt Hopley",
// "Rishyn Patel and Dawid Lechowicz" = "Dawid Lechowicz/ Rishyn Patel").
// ---------------------------------------------------------------------------
const STOP = new Set(["and", "the", "ltd", "limited"]);
export function nameTokens(s: string): string[] {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t && !STOP.has(t));
}

/** How alike two client names are (0..1): every word of the shorter name must have a close word in the longer one. */
export function nameScore(a: string, b: string, jw: (x: string, y: string) => number): number {
  const ta = nameTokens(a);
  const tb = nameTokens(b);
  if (!ta.length || !tb.length) return 0;
  if (ta.join(" ") === tb.join(" ")) return 1;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  if (short.length === 1 && long.length > 1) return 0; // "Keith" alone is too vague
  let total = 0;
  for (const t of short) {
    const best = Math.max(...long.map((u) => jw(t, u)));
    if (best < 0.9) return 0;
    total += best;
  }
  return total / short.length;
}
