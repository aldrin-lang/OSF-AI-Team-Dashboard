/** Text clean-up so Donna's voice reads money, dates and symbols naturally. */

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const CUR: Record<string, [string, string, string, string]> = {
  // symbol/code: [singular, plural, minor singular, minor plural]
  "£": ["pound", "pounds", "penny", "pence"],
  GBP: ["pound", "pounds", "penny", "pence"],
  "€": ["euro", "euros", "cent", "cents"],
  EUR: ["euro", "euros", "cent", "cents"],
  "$": ["dollar", "dollars", "cent", "cents"],
  USD: ["dollar", "dollars", "cent", "cents"],
  NZD: ["New Zealand dollar", "New Zealand dollars", "cent", "cents"],
  AUD: ["Australian dollar", "Australian dollars", "cent", "cents"],
  CAD: ["Canadian dollar", "Canadian dollars", "cent", "cents"],
  PHP: ["peso", "pesos", "centavo", "centavos"],
  "₱": ["peso", "pesos", "centavo", "centavos"],
};

function money(cur: string, amount: string): string {
  const w = CUR[cur] ?? CUR[cur.toUpperCase()];
  if (!w) return `${cur} ${amount}`;
  const [whole, frac = ""] = amount.replace(/,/g, "").split(".");
  const n = Number(whole);
  const minor = frac ? Number(frac.padEnd(2, "0").slice(0, 2)) : 0;
  const main = `${n.toLocaleString("en-GB")} ${n === 1 ? w[0] : w[1]}`;
  return minor ? `${main} ${minor}` : main;
}

/** Make text sound natural when read aloud: money, dates, symbols. */
export function normaliseForSpeech(t: string): string {
  return t
    .replace(/(£|€|\$|₱)\s?(\d[\d,]*(?:\.\d{1,2})?)/g, (_, c: string, a: string) => money(c, a))
    .replace(/\b(GBP|EUR|USD|NZD|AUD|CAD|PHP)\s?(\d[\d,]*(?:\.\d{1,2})?)/g, (_, c: string, a: string) => money(c, a))
    .replace(/\b(\d[\d,]*(?:\.\d{1,2})?)\s?(GBP|EUR|USD|NZD|AUD|CAD|PHP)\b/g, (_, a: string, c: string) => money(c, a))
    .replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_, y: string, m: string, d: string) => `${Number(d)} ${MONTHS[Number(m) - 1] ?? m}${y === String(new Date().getFullYear()) ? "" : ` ${y}`}`)
    .replace(/(\d)\s?%/g, "$1 percent")
    .replace(/\s&\s/g, " and ")
    .replace(/\bvs\.?\s/gi, "versus ")
    .replace(/\be\.g\.\s?/gi, "for example ")
    .replace(/\bi\.e\.\s?/gi, "that is ")
    .replace(/\/h\b/g, " an hour")
    .replace(/\/wk\b/g, " a week")
    .replace(/\b(\d+)\s?h\b/g, (_, h: string) => `${h} ${h === "1" ? "hour" : "hours"}`);
}
