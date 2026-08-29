import type { Client, ClientLine, PipelineStage, Profile } from "@/lib/types";
import { ghlLinks } from "@/lib/ghl";

/** Replace {{key}} tokens. Unknown tokens are left as-is so nothing silently vanishes. */
export function renderTemplate(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, key) =>
    key in vars ? vars[key] : m,
  );
}

export const TEMPLATE_VARS: { key: string; label: string }[] = [
  { key: "company", label: "Company name" },
  { key: "contact", label: "Contact name" },
  { key: "ai_phones", label: "AI phone list (name: number)" },
  { key: "booking_system", label: "Booking system" },
  { key: "dashboard_url", label: "Client dashboard URL" },
  { key: "ghl_link", label: "GHL location link" },
  { key: "manager", label: "AI manager name" },
  { key: "country", label: "Country" },
  { key: "industry", label: "Industry" },
  { key: "stage", label: "Current stage" },
  { key: "today", label: "Today's date" },
];

export function buildClientVars(
  client: Client,
  lines: ClientLine[],
  manager: Profile | null,
  stage: PipelineStage | null,
): Record<string, string> {
  const phones =
    lines
      .filter((l) => l.ai_phone_number || l.label)
      .map((l) => `- ${[l.label, l.ai_phone_number].filter(Boolean).join(": ")}`)
      .join("\n") || "- (add the AI phone numbers on the client page)";

  const dash = lines.find((l) => l.dashboard_url)?.dashboard_url ?? "";
  const ghl = ghlLinks(lines.find((l) => l.ghl_location_id)?.ghl_location_id)?.dashboard ?? "";

  return {
    company: client.company_name || client.name,
    contact: client.name || "there",
    ai_phones: phones,
    booking_system: lines.find((l) => l.booking_system)?.booking_system || "your calendar",
    dashboard_url: dash || "(dashboard link pending)",
    ghl_link: ghl,
    manager: manager?.full_name || "the OutsourceForce team",
    country: client.country || "",
    industry: client.industry || "",
    stage: stage?.name || "",
    today: new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
  };
}
