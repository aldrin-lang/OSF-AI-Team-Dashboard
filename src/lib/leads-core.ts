// Pure helpers for leads. No imports on purpose: they are unit-tested with plain
// Node (scripts/test-leads-core.mjs) and shared by the webhook, the GHL sync and
// the backfill script.

export type LeadService = "ai" | "va" | "unknown";
export type PhoneFlag = "likely_miscoded_353" | "no_country_code";

export interface IncomingLead {
  contactId: string | null;
  opportunityId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  tags: string[];
  vaRole: string | null;
  jobDescription: string | null;
  ghlAssignedTo: string | null;
  createdAt: string | null;
  custom: Record<string, unknown>;
}

export interface PhoneInfo {
  phone: string | null;
  suggested: string | null;
  flag: PhoneFlag | null;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

function str(v: unknown): string | null {
  if (typeof v === "string") {
    const t = v.trim();
    return t === "" ? null : t;
  }
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

/** First non-empty value for any of `keys` (case-insensitive), searching sources in order. */
function pickRaw(sources: Obj[], keys: string[]): unknown {
  const wanted = keys.map((k) => k.toLowerCase());
  for (const src of sources) {
    const lower = new Map(Object.keys(src).map((k) => [k.toLowerCase(), k]));
    for (const w of wanted) {
      const real = lower.get(w);
      if (real === undefined) continue;
      const v = src[real];
      if (Array.isArray(v) ? v.length > 0 : str(v) !== null) return v;
    }
  }
  return undefined;
}
const pick = (sources: Obj[], keys: string[]): string | null => str(pickRaw(sources, keys));

/** First non-empty string whose KEY matches `re`. */
function scan(sources: Obj[], re: RegExp): string | null {
  for (const src of sources) {
    for (const [k, v] of Object.entries(src)) {
      if (re.test(k)) {
        const s = str(v);
        if (s) return s;
      }
    }
  }
  return null;
}

export function toTags(v: unknown): string[] {
  const raw = Array.isArray(v) ? v.map((x) => str(x) ?? "") : typeof v === "string" ? v.split(/[,;]/) : [];
  return [...new Set(raw.map((t) => t.trim()).filter(Boolean))];
}

export function validIso(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

/**
 * Read a GHL webhook body. Tolerant on purpose: our workflow sends `customData`
 * (contact_id, opportunity_id, name, email, phone, source, tags, ...) but GHL's
 * standard top-level fields are used as fallbacks. Returns null if there is no
 * GHL contact or opportunity id to key the lead on.
 */
export function parseGhlPayload(body: unknown): IncomingLead | null {
  const root: Obj = isObj(body) ? body : {};
  const cd: Obj = isObj(root.customData) ? root.customData : {};
  const contact: Obj = isObj(root.contact) ? root.contact : {};
  const opp: Obj = isObj(root.opportunity) ? root.opportunity : {};
  const sources = [cd, root, contact, opp];

  const contactId = pick(sources, ["contact_id", "contactId"]) ?? str(contact.id);
  const opportunityId = pick(sources, ["opportunity_id", "opportunityId"]) ?? str(opp.id);
  if (!contactId && !opportunityId) return null;

  const first = pick(sources, ["first_name", "firstName"]);
  const last = pick(sources, ["last_name", "lastName"]);
  const name =
    pick(sources, ["name", "full_name", "fullName", "contact_name"]) ??
    [first, last].filter(Boolean).join(" ");

  const custom: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(cd)) {
    custom[k] = typeof v === "string" && v.length > 1000 ? `${v.slice(0, 1000)}…` : v;
  }

  return {
    contactId,
    opportunityId,
    name,
    email: pick(sources, ["email"]),
    phone: pick(sources, ["phone", "phone_number", "phoneNumber"]),
    source: pick(sources, ["source", "contact_source", "opportunity_source"]),
    tags: toTags(pickRaw(sources, ["tags"])),
    vaRole:
      pick(sources, ["va_role", "vaRole", "va_type", "vaType"]) ??
      scan(sources, /what[_ ]?(type[_ ]?of[_ ])?va|va[_ ]?(position|profession|role)/i),
    jobDescription: pick(sources, ["job_description", "job_description_details", "jobDescription"]),
    ghlAssignedTo: pick(sources, ["assigned_to", "assignedTo"]),
    createdAt: pick(sources, ["created_at", "createdAt", "date_created", "dateAdded"]),
    custom,
  };
}

/** Dedupe key: the opportunity if there is one, otherwise the contact. */
export function ghlKeyFor(l: Pick<IncomingLead, "contactId" | "opportunityId">): string | null {
  if (l.opportunityId) return l.opportunityId;
  if (l.contactId) return `contact:${l.contactId}`;
  return null;
}

const AI_TAG = /ai[-_ ]?recept/i;
// "va" not followed by a letter: matches marketingva-ie, uk-mva, accountantva, ukpremiumqs-va;
// does not match words like "valid". Appointment setters and premium-QS are VA roles too.
const VA_TAG = /va(?![a-z])|appointment[-_ ]?setter|premiumqs/i;

/** AI receptionist vs VA, from GHL tags (and the website form's VA fields). */
export function classifyService(tags: string[], vaRole?: string | null): LeadService {
  if (tags.some((t) => AI_TAG.test(t))) return "ai";
  if (vaRole && vaRole.trim()) return "va";
  if (tags.some((t) => VA_TAG.test(t))) return "va";
  return "unknown";
}

/**
 * The website form drops the "+" from phone numbers, so GHL then puts +353 in
 * front of a foreign number. An Irish number is +353 plus at most 9 digits, so
 * "+353" followed by 10 or more digits is almost certainly a mis-coded foreign
 * number. We never rewrite the number — we keep what GHL has and flag it, with a
 * best guess ("+" + the digits after 353) the team can check.
 */
export function analysePhone(raw: string | null | undefined): PhoneInfo {
  const phone = (raw ?? "").trim();
  if (!phone) return { phone: null, suggested: null, flag: null };
  const compact = phone.replace(/[^\d+]/g, "");
  if (compact.startsWith("+353")) {
    const rest = compact.slice(4);
    if (rest.length >= 10) return { phone, suggested: `+${rest}`, flag: "likely_miscoded_353" };
    return { phone, suggested: null, flag: null };
  }
  if (!compact.startsWith("+")) return { phone, suggested: null, flag: "no_country_code" };
  return { phone, suggested: null, flag: null };
}
