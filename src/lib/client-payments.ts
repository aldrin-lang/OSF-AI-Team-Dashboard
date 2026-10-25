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

/** Which Accounts tab a payment line is in, on a given day (YYYY-MM-DD). */
export function stageOf(p: Pick<ClientPayment, "amount" | "paid_amount" | "invoice_no" | "due_on">, today: string): Stage {
  const amount = Number(p.amount) || 0;
  const paid = Number(p.paid_amount) || 0;
  if (paid > 0 && paid + 0.005 >= amount) return "paid";
  if (!p.invoice_no?.trim()) return "for-invoice";
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
  const d1 = Math.min(Number(m[1]), last);
  const d2 = Math.min(Number(m[2]), last);
  return { start: `${y}-${pad(mi + 1)}-${pad(d1)}`, end: `${y}-${pad(mi + 1)}-${pad(d2)}` };
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "25/10/2026", "10/25/2026" (when unambiguous), "2026-10-25", "Oct 25, 2026" → YYYY-MM-DD, or null. */
export function parseSheetDate(v: string): string | null {
  const s = v.trim();
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  m = s.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/);
  if (m) {
    let [d, mo] = [+m[1], +m[2]];
    if (mo > 12 && d <= 12) [d, mo] = [mo, d];
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return mo >= 1 && mo <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(mo)}-${pad(d)}` : null;
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
}

export const money = (n: number, currency = "EUR") =>
  new Intl.NumberFormat("en-IE", { style: "currency", currency, minimumFractionDigits: 2 }).format(Number(n) || 0);

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
