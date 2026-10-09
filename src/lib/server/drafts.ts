import "server-only";
import type { Area } from "@/lib/areas";

/**
 * Email drafts waiting for a person to review and send. Donna can read them
 * and rewrite their text (never send them by herself).
 */
export const DRAFT_TYPES = ["payment_reminder", "checkin", "client_email"] as const;
export type DraftType = (typeof DRAFT_TYPES)[number];

export const DRAFTS: Record<
  DraftType,
  { table: "payment_reminders" | "checkins" | "client_emails"; area: Area; openStatus: string; bodyCol: "body" | "message"; label: string; href: string; managerOnly: boolean }
> = {
  payment_reminder: { table: "payment_reminders", area: "payments", openStatus: "draft", bodyCol: "body", label: "payment reminder", href: "/payments?view=reminders", managerOnly: true },
  checkin: { table: "checkins", area: "checkins", openStatus: "due", bodyCol: "message", label: "check-in", href: "/check-ins?view=send", managerOnly: false },
  client_email: { table: "client_emails", area: "clients", openStatus: "draft", bodyCol: "body", label: "client email", href: "/", managerOnly: false },
};

export const isDraftType = (v: unknown): v is DraftType => typeof v === "string" && (DRAFT_TYPES as readonly string[]).includes(v);

/** The select for one draft type: id, subject, text and who it's for. */
export function draftSelect(t: DraftType): string {
  if (t === "payment_reminder") return "id, subject, body, invoice_id, invoices(number, clients(name))";
  if (t === "checkin") return "id, subject, message, kind, contact_name, client_id, clients(name)";
  return "id, subject, body, to_email, client_id, clients(name)";
}

type Row = Record<string, unknown>;

/** "Acme Ltd · invoice INV-12" / "Maria (VA) · Acme Ltd" — who the draft is for. */
export function draftWho(t: DraftType, r: Row): string {
  const client = (r.clients as { name?: string } | null)?.name ?? "";
  if (t === "payment_reminder") {
    const inv = r.invoices as { number?: string; clients?: { name?: string } | null } | null;
    return [inv?.clients?.name ?? "Client", inv?.number ? `invoice ${inv.number}` : ""].filter(Boolean).join(" · ");
  }
  if (t === "checkin") return [r.contact_name ? `${r.contact_name}${r.kind === "va" ? " (VA)" : ""}` : "", client].filter(Boolean).join(" · ") || "Check-in";
  return [client, r.to_email as string].filter(Boolean).join(" · ") || "Client email";
}

export function draftHref(t: DraftType, r: Row): string {
  if (t === "payment_reminder" && r.invoice_id) return `/payments/${r.invoice_id}`;
  if (t === "client_email" && r.client_id) return `/clients/${r.client_id}`;
  return DRAFTS[t].href;
}
