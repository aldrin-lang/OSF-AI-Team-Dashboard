/**
 * Pure helpers for the ops automations (no imports, no I/O) so they can be
 * unit-tested with plain Node: dates in Irish time, payment-reminder stages,
 * check-in scheduling, candidate form parsing and country-from-phone.
 */

// ---------------------------------------------------------------------------
// Dates — the business runs on Irish time; all "days" are Europe/Dublin days.
// ---------------------------------------------------------------------------
export const BUSINESS_TZ = "Europe/Dublin";

/** YYYY-MM-DD for the given instant in Dublin. */
export function dublinDate(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(v: unknown): v is string {
  return typeof v === "string" && ISO_DATE.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));
}

/** Calendar arithmetic on YYYY-MM-DD strings (UTC midnight, no DST surprises). */
export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Start/end instants (ISO) of a Dublin calendar day — for "what happened on day X" queries. */
export function dublinDayBounds(date: string): { start: string; end: string } {
  // Dublin is UTC+0 in winter and UTC+1 in summer; find the offset at local noon.
  const noonUtc = new Date(`${date}T12:00:00Z`);
  const localHour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: BUSINESS_TZ, hour: "2-digit", hour12: false }).format(noonUtc),
  );
  const offsetHours = localHour - 12;
  const start = new Date(Date.parse(`${date}T00:00:00Z`) - offsetHours * 3_600_000);
  const end = new Date(start.getTime() + 86_400_000);
  return { start: start.toISOString(), end: end.toISOString() };
}

// ---------------------------------------------------------------------------
// Money
// ---------------------------------------------------------------------------
export const CURRENCIES = ["GBP", "EUR", "NZD", "AUD", "CAD", "USD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 2 }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}

// ---------------------------------------------------------------------------
// Payment reminders
//   3 days before due -> friendly heads-up; due date; 3 / 7 / 14 days overdue
//   with the tone getting firmer. One reminder per stage per invoice; if the
//   daily job misses a day it creates only the latest stage reached.
// ---------------------------------------------------------------------------
export type ReminderStage = "before_due" | "due_today" | "overdue_3" | "overdue_7" | "overdue_14";

export const REMINDER_STAGE_LABEL: Record<ReminderStage | "manual", string> = {
  before_due: "Due in 3 days",
  due_today: "Due today",
  overdue_3: "3 days overdue",
  overdue_7: "7 days overdue",
  overdue_14: "14+ days overdue",
  manual: "Manual reminder",
};

/** The latest reminder stage an invoice has reached today, or null if none yet. */
export function reminderStage(dueOn: string, today: string): ReminderStage | null {
  const late = daysBetween(dueOn, today); // >0 overdue, <0 not yet due
  if (late >= 14) return "overdue_14";
  if (late >= 7) return "overdue_7";
  if (late >= 3) return "overdue_3";
  if (late >= 0) return late === 0 ? "due_today" : null; // 1-2 days late: wait for day 3
  if (late >= -3) return "before_due";
  return null;
}

export type InvoiceHealth = "paid" | "void" | "overdue" | "due_soon" | "open";

export function invoiceHealth(status: string, dueOn: string, today: string): InvoiceHealth {
  if (status === "paid") return "paid";
  if (status === "void") return "void";
  const late = daysBetween(dueOn, today);
  if (late > 0) return "overdue";
  if (late >= -7) return "due_soon";
  return "open";
}

export interface ReminderTemplateInput {
  stage: ReminderStage | "manual";
  clientName: string;
  contactName?: string | null;
  invoiceNumber: string;
  amount: string; // already formatted with currency
  dueOn: string;
}

/** Plain-text fallback used when no AI key is configured (and as the AI's guidance). */
export function reminderTemplate(i: ReminderTemplateInput): { subject: string; body: string } {
  const hi = `Hi ${i.contactName?.trim() || i.clientName},`;
  const sign = "Kind regards,\nAccounts team\nOutsourceForce";
  switch (i.stage) {
    case "before_due":
      return {
        subject: `Friendly reminder: invoice ${i.invoiceNumber} is due on ${i.dueOn}`,
        body: `${hi}\n\nJust a friendly heads-up that invoice ${i.invoiceNumber} for ${i.amount} is due on ${i.dueOn}.\n\nIf it's already on its way, thank you, and please ignore this note.\n\n${sign}`,
      };
    case "due_today":
      return {
        subject: `Invoice ${i.invoiceNumber} is due today`,
        body: `${hi}\n\nA quick reminder that invoice ${i.invoiceNumber} for ${i.amount} is due today (${i.dueOn}).\n\nIf you've already paid, thank you. Just reply and let us know.\n\n${sign}`,
      };
    case "overdue_3":
      return {
        subject: `Invoice ${i.invoiceNumber} is now overdue`,
        body: `${hi}\n\nOur records show invoice ${i.invoiceNumber} for ${i.amount} (due ${i.dueOn}) is still outstanding.\n\nCould you let us know when we can expect payment? If there's an issue with the invoice, just reply and we'll sort it out.\n\n${sign}`,
      };
    case "overdue_7":
      return {
        subject: `Second reminder: invoice ${i.invoiceNumber} is 7 days overdue`,
        body: `${hi}\n\nInvoice ${i.invoiceNumber} for ${i.amount} was due on ${i.dueOn} and is now a week overdue.\n\nPlease arrange payment at your earliest convenience, or reply to let us know the expected payment date.\n\n${sign}`,
      };
    case "overdue_14":
      return {
        subject: `Urgent: invoice ${i.invoiceNumber} is 14 days overdue`,
        body: `${hi}\n\nInvoice ${i.invoiceNumber} for ${i.amount} (due ${i.dueOn}) is now more than two weeks overdue.\n\nPlease settle it this week or contact us today so we can agree a plan. We want to keep your service running without interruption.\n\n${sign}`,
      };
    default:
      return {
        subject: `Reminder: invoice ${i.invoiceNumber}`,
        body: `${hi}\n\nThis is a reminder about invoice ${i.invoiceNumber} for ${i.amount}, due on ${i.dueOn}.\n\n${sign}`,
      };
  }
}

// ---------------------------------------------------------------------------
// Check-ins
// ---------------------------------------------------------------------------
/**
 * Next check-in date: every `everyDays` after the last one; the first one
 * comes `everyDays` after the start date (or creation date if no start date).
 */
export function nextCheckinDue(opts: {
  lastDueOn: string | null;
  startDate: string | null;
  createdAt: string; // ISO timestamp or date
  everyDays: number;
}): string {
  const every = Math.min(90, Math.max(3, Math.round(opts.everyDays || 14)));
  if (opts.lastDueOn && isIsoDate(opts.lastDueOn)) return addDays(opts.lastDueOn, every);
  const base = opts.startDate && isIsoDate(opts.startDate) ? opts.startDate : opts.createdAt.slice(0, 10);
  return addDays(base, every);
}

export interface CheckinTemplateInput {
  kind: "client" | "va";
  contactName: string;
  clientName: string;
  vaName?: string | null;
  service: "ai" | "va";
}

export function checkinTemplate(i: CheckinTemplateInput): { subject: string; body: string } {
  const first = i.contactName.trim().split(/\s+/)[0] || "there";
  if (i.kind === "va") {
    return {
      subject: `Quick check-in: how are things going with ${i.clientName}?`,
      body: `Hi ${first},\n\nJust checking in to see how everything is going with ${i.clientName}.\n\n1. How is the workload this week?\n2. Is anything blocking you or unclear?\n3. Is there anything you need from us?\n\nReply whenever you get a chance. Thank you for your hard work!\n\nOutsourceForce team`,
    };
  }
  const what =
    i.service === "ai"
      ? "your AI receptionist"
      : i.vaName
        ? `${i.vaName}, your VA`
        : "your VA";
  return {
    subject: `Checking in: how is ${i.service === "ai" ? "your AI receptionist" : "your VA"} working out?`,
    body: `Hi ${first},\n\nJust a quick check-in to see how things are going with ${what}.\n\n1. Is everything working the way you expected?\n2. Is there anything you'd like us to change or improve?\n3. Anything else we can help with?\n\nA short reply is perfect. We're here to make sure you're getting full value.\n\nBest regards,\nOutsourceForce team`,
  };
}

/** wa.me link with the message pre-filled (no WhatsApp API needed). */
export function whatsappLink(phone: string | null | undefined, text: string): string | null {
  const digits = (phone ?? "").replace(/[^\d]/g, "");
  if (digits.length < 8) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

// ---------------------------------------------------------------------------
// Country from phone (same rule as the sheet automation)
// ---------------------------------------------------------------------------
export function countryFromPhone(phone: string | null | undefined): string | null {
  const p = (phone ?? "").replace(/[\s()-]/g, "");
  if (p.startsWith("+44")) return "UK";
  if (p.startsWith("+353")) return p.length <= 13 ? "Ireland" : null; // longer = mis-coded foreign number
  if (p.startsWith("+64")) return "New Zealand";
  if (p.startsWith("+61")) return "Australia";
  if (p.startsWith("+1")) return "Canada";
  if (p.startsWith("+63")) return "Philippines";
  return null;
}

// ---------------------------------------------------------------------------
// Candidates (PIT form submissions from GHL)
// ---------------------------------------------------------------------------
export const VA_ROLES = [
  "Executive Assistant",
  "General Admin VA",
  "Appointment Setter",
  "Customer Support VA",
  "Social Media Manager",
  "Digital Marketer VA",
  "Bookkeeper / Accountant VA",
  "Quantity Surveyor (QS) VA",
  "Architect VA",
  "Engineer VA",
  "Property Management VA",
  "Web Developer",
  "Graphic Designer",
] as const;

export interface IncomingCandidate {
  externalKey: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  country: string | null;
  source: string | null;
  appliedRole: string | null;
  experience: string | null;
  hourlyRate: string | null;
  availability: string | null;
  cvUrl: string | null;
  portfolioUrl: string | null;
  answers: Record<string, string>;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** First file URL out of GHL's file-upload shapes ({url}, [{url}], {id:{url}} or a plain string). */
export function fileUrl(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string") return /^https?:\/\//.test(v.trim()) ? v.trim() : null;
  if (Array.isArray(v)) {
    for (const x of v) {
      const u = fileUrl(x);
      if (u) return u;
    }
    return null;
  }
  if (isObj(v)) {
    if (typeof v.url === "string") return fileUrl(v.url);
    for (const x of Object.values(v)) {
      const u = fileUrl(x);
      if (u) return u;
    }
  }
  return null;
}

function text(v: unknown): string | null {
  if (v == null) return null;
  if (Array.isArray(v)) {
    const parts = v.map((x) => text(x)).filter(Boolean);
    return parts.length ? parts.join(", ") : null;
  }
  if (isObj(v)) return null;
  const s = String(v).trim();
  return s ? s.slice(0, 4000) : null;
}

// GHL standard webhook keys that are not form answers
const META_KEYS = new Set([
  "contact_id", "id", "first_name", "last_name", "full_name", "name", "email", "phone", "tags", "country",
  "date_created", "contact_source", "contact_type", "full_address", "address1", "city", "state", "postal_code",
  "timezone", "location", "workflow", "triggerData", "contact", "user", "customData", "attributionSource",
  "lastAttributionSource", "opportunity_id", "company_name", "website", "date_of_birth", "source",
]);

/** Find the first answer whose question matches any of the patterns. */
function pick(answers: Record<string, string>, ...patterns: RegExp[]): string | null {
  for (const re of patterns) {
    for (const [k, v] of Object.entries(answers)) if (re.test(k) && v) return v;
  }
  return null;
}

export function parseCandidatePayload(body: unknown): IncomingCandidate {
  const root: Obj = isObj(body) ? body : {};
  const custom: Obj = isObj(root.customData) ? root.customData : {};
  const contact: Obj = isObj(root.contact) ? root.contact : {};
  const all: Obj = { ...contact, ...root, ...custom };

  const answers: Record<string, string> = {};
  let cvUrl: string | null = null;
  let portfolioUrl: string | null = null;
  for (const [k, v] of Object.entries(all)) {
    if (META_KEYS.has(k)) continue;
    if (/cv|resume/i.test(k)) cvUrl = cvUrl ?? fileUrl(v);
    else if (/portfolio/i.test(k)) portfolioUrl = portfolioUrl ?? fileUrl(v);
    const t = text(v) ?? (fileUrl(v) ? `[file] ${fileUrl(v)}` : null);
    if (t) answers[k.slice(0, 200)] = t;
  }

  const first = text(all.first_name) ?? "";
  const last = text(all.last_name) ?? "";
  const fullName = (text(all.full_name) ?? text(all.name) ?? `${first} ${last}`).trim();
  const contactId = text(all.contact_id) ?? (isObj(root.contact) ? text(root.contact.id) : null);
  const email = text(all.email)?.toLowerCase() ?? null;

  return {
    externalKey: contactId ? `ghl:${contactId}` : email ? `email:${email}` : null,
    fullName,
    email,
    phone: text(all.phone),
    country: text(all.country),
    source: pick(answers, /job platform|platform|where.*(find|hear|apply)/i) ?? text(all.source),
    appliedRole: pick(answers, /position title|position|role|applying for|job title/i),
    experience: pick(answers, /years|experience/i),
    hourlyRate: pick(answers, /hourly rate|rate expectation|salary|expected rate/i),
    availability: pick(answers, /part time|full time|availability|hours a week/i),
    cvUrl,
    portfolioUrl,
    answers,
  };
}

/**
 * Keyword fallback when no AI key is set: the closest VA_ROLES entry for the
 * role the candidate applied for (null when nothing matches).
 */
const ROLE_KEYWORDS: [RegExp, (typeof VA_ROLES)[number]][] = [
  [/executive|\bea\b|personal assistant/i, "Executive Assistant"],
  [/appointment|setter|cold call|telemarket|sdr|lead gen/i, "Appointment Setter"],
  [/customer (support|service)|csr|help ?desk|chat support/i, "Customer Support VA"],
  [/social media|smm|content creator/i, "Social Media Manager"],
  [/digital market|seo|ppc|ads|email market/i, "Digital Marketer VA"],
  [/bookkeep|accountant|accounting|xero|quickbooks|payroll/i, "Bookkeeper / Accountant VA"],
  [/quantity surveyor|\bqs\b|estimat/i, "Quantity Surveyor (QS) VA"],
  [/architect|autocad|revit|draft/i, "Architect VA"],
  [/engineer/i, "Engineer VA"],
  [/property|real estate|lettings|tenant/i, "Property Management VA"],
  [/web dev|developer|wordpress|shopify|front.?end|programm/i, "Web Developer"],
  [/graphic|designer|canva|photoshop|video edit/i, "Graphic Designer"],
  [/admin|virtual assistant|data entry|\bva\b/i, "General Admin VA"],
];

export function guessRole(text: string | null | undefined): (typeof VA_ROLES)[number] | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  for (const [re, role] of ROLE_KEYWORDS) if (re.test(t)) return role;
  return null;
}

// ---------------------------------------------------------------------------
// Email helpers
// ---------------------------------------------------------------------------
export function escapeHtml(t: string): string {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** Plain text (as typed in the dashboard) to simple email HTML. */
export function textToHtml(t: string): string {
  return t
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${escapeHtml(p).replace(/\n/g, "<br/>")}</p>`)
    .join("");
}
