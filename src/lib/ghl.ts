// Build GoHighLevel deep-links from a location (sub-account) id so nobody has
// to paste 200-character URLs.
const BASE = "https://app.gohighlevel.com/v2/location";

export function ghlLinks(locationId: string | null | undefined) {
  if (!locationId) return null;
  const at = (path: string) => `${BASE}/${locationId}/${path}`;
  return {
    dashboard: at("dashboard"),
    conversations: at("conversations/conversations"),
    contacts: at("contacts/list"),
    knowledgeBase: at("ai-agents/knowledge-base"),
    voiceAi: at("ai-agents/voice-ai"),
    workflows: at("automation/workflows"),
    calendars: at("calendars"),
  };
}

/** Deep link to one contact in a GHL sub-account. */
export function ghlContactLink(
  locationId: string | null | undefined,
  contactId: string | null | undefined,
) {
  if (!locationId || !contactId) return null;
  return `${BASE}/${locationId}/contacts/detail/${contactId}`;
}
