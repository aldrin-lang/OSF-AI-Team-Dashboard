/** Client-facing portal (portal.outsourceforce.ai) — the separate live product.
 *  Used only to build outbound links; nothing here reads or writes it. */
export const PORTAL_URL = "https://portal.outsourceforce.ai";

/** The best link into the portal for a client: its own if set, else the login. */
export function portalLinkFor(client: { portal_url: string | null }): string {
  return client.portal_url?.trim() || `${PORTAL_URL}/login`;
}
