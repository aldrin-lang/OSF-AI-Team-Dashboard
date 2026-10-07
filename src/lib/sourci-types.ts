/** Shared between the Sourci API routes and the Sourci widget. */
export interface SourciChart {
  title: string;
  subtitle?: string;
  unit?: string; // e.g. "leads", "invoices"
  bars: { label: string; value: number }[];
}

/** Free-form result card (meeting brief, client summary, lists). */
export interface SourciCard {
  eyebrow?: string; // e.g. "MEETING BRIEF · AUTO-GENERATED"
  title: string;
  facts?: { label: string; value: string }[];
  bullets?: string[];
  headsUp?: string;
  sources?: { label: string; count: number }[];
}

export interface SourciPipeline {
  total: number;
  label: string; // e.g. "open leads"
  stages: { label: string; value: number }[];
  attention: { title: string; detail: string }[];
}

/** Floating mini-dashboard (payments, leads, check-ins, ...). Rows/buttons can link to pages. */
export interface SourciDashboard {
  eyebrow: string;
  title: string;
  stats: { label: string; value: string; tone?: "default" | "alert" | "good" }[];
  list?: { title: string; items: { title: string; detail?: string; href?: string; tone?: "alert" | "default" }[] };
  bars?: { label: string; value: number }[];
  link?: { href: string; label: string };
}

/** A change Sourci wants to make. Executed only after the user confirms. */
export type SourciProposal =
  | { kind: "update_lead"; leadId: string; leadName: string; status?: string; setterId?: string | null; setterName?: string; note?: string }
  | { kind: "create_client"; pipeline: "ai" | "va"; name: string; contactName?: string; contactEmail?: string; phone?: string; country?: string; source?: string; needs?: string }
  | { kind: "add_note"; clientId: string; clientName: string; body: string }
  | { kind: "create_task"; title: string; clientId?: string; clientName?: string; assigneeId?: string; assigneeName?: string; dueDate?: string }
  | { kind: "invoice_status"; invoiceId: string; number: string; status: "paid" | "void" }
  | { kind: "candidate_status"; candidateId: string; name: string; status: string }
  | { kind: "send_email"; to: string; subject: string; body: string; clientId?: string; clientName?: string }
  | { kind: "notify_team"; title: string; body?: string; audience: string; recipientIds: string[] }
  | { kind: "bulk_update_leads"; leadIds: string[]; setterId?: string | null; setterName?: string; status?: string }
  | { kind: "bulk_update"; entity: string; ids: string[]; changes: { field: string; value: string | number | boolean | null; display: string }[] }
  | { kind: "move_stage"; clientIds: string[]; stageId: string; stageName: string }
  | { kind: "convert_lead"; leadId: string; leadName: string }
  | { kind: "create_invoice"; clientId: string; clientName: string; number: string; amount: number; currency: string; dueOn: string; description?: string; billTo?: string }
  | { kind: "create_concern"; clientId: string; clientName: string; title: string; severity: string; description?: string; ownerId?: string }
  | { kind: "send_reminders"; reminderIds: string[] }
  | { kind: "send_checkins"; checkinIds: string[] }
  | { kind: "add_sheet_row"; sheetId: string; sheetName: string; cells: Record<string, string | number | boolean | null> }
  | { kind: "create_sheet"; template: string; name: string; visibility: "private" | "everyone" }
  | { kind: "create_role"; clientId: string; clientName: string; title: string; headcount: number; employmentType: "full_time" | "part_time" | "project"; startBy?: string; priority: "low" | "normal" | "high" | "urgent"; requirements?: string }
  | { kind: "shortlist"; roleId: string; roleTitle: string; candidateIds: string[]; names: string[] }
  | { kind: "hire"; roleId: string; roleCandidateId: string; name: string; clientName: string; startDate?: string; hourlyRate?: number; currency: string };

export interface SourciConfirm {
  title: string; // e.g. "Create client profile"
  preview: { label: string; value: string }[];
  proposal: SourciProposal;
}

export type SourciAction =
  | { type: "navigate"; href: string; label: string }
  | { type: "chart"; chart: SourciChart }
  | { type: "card"; card: SourciCard }
  | { type: "pipeline"; pipeline: SourciPipeline }
  | { type: "dashboard"; dashboard: SourciDashboard }
  | { type: "confirm"; confirm: SourciConfirm }
  | { type: "done"; stamp: string; title: string; detail?: string; href?: string };

export interface SourciTurn {
  role: "user" | "assistant";
  content: string;
}

export interface SourciReply {
  reply: string;
  actions: SourciAction[];
  error?: string;
}
