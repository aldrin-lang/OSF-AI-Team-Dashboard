import type {
  BuildStatus,
  ChecklistStatus,
  ClientStatus,
  ConcernSeverity,
  ConcernStatus,
  HiringFeeStatus,
  PlacementStatus,
  RbStatus,
} from "@/lib/types";

export type Tone = "neutral" | "blue" | "amber" | "green" | "red" | "purple";

export const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-600 ring-slate-200",
  blue: "bg-brand-50 text-brand-700 ring-brand-200",
  amber: "bg-accent-500/10 text-accent-600 ring-accent-500/25",
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  red: "bg-rose-50 text-rose-600 ring-rose-200",
  purple: "bg-violet-50 text-violet-700 ring-violet-200",
};

export const CLIENT_STATUS: Record<ClientStatus, { label: string; tone: Tone }> = {
  active: { label: "Active", tone: "blue" },
  live: { label: "Live", tone: "green" },
  paused: { label: "Paused", tone: "amber" },
  withdrawn: { label: "Withdrawn", tone: "neutral" },
  rejected: { label: "Rejected", tone: "red" },
  churned: { label: "Churned", tone: "red" },
};

export const RB_STATUS: Record<RbStatus, { label: string; tone: Tone }> = {
  not_started: { label: "Not started", tone: "neutral" },
  docs_needed: { label: "Docs needed", tone: "amber" },
  submitted: { label: "Submitted", tone: "blue" },
  approved: { label: "Approved", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
};

export const BUILD_STATUS: Record<BuildStatus, { label: string; tone: Tone }> = {
  not_started: { label: "Not started", tone: "neutral" },
  in_progress: { label: "In progress", tone: "blue" },
  submitted: { label: "Submitted", tone: "purple" },
  approved: { label: "Approved", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
};

export const CHECKLIST_STATUS: Record<ChecklistStatus, { label: string; tone: Tone }> = {
  todo: { label: "To do", tone: "neutral" },
  doing: { label: "Doing", tone: "blue" },
  done: { label: "Done", tone: "green" },
  blocked: { label: "Blocked", tone: "red" },
  na: { label: "N/A", tone: "neutral" },
};

export const CONCERN_STATUS: Record<ConcernStatus, { label: string; tone: Tone }> = {
  open: { label: "Open", tone: "red" },
  in_progress: { label: "In progress", tone: "amber" },
  resolved: { label: "Resolved", tone: "green" },
};

export const CONCERN_SEVERITY: Record<ConcernSeverity, { label: string; tone: Tone }> = {
  low: { label: "Low", tone: "neutral" },
  medium: { label: "Medium", tone: "blue" },
  high: { label: "High", tone: "amber" },
  urgent: { label: "Urgent", tone: "red" },
};

export const HIRING_FEE_STATUS: Record<HiringFeeStatus, { label: string; tone: Tone }> = {
  not_applicable: { label: "N/A", tone: "neutral" },
  pending: { label: "Pending", tone: "amber" },
  invoiced: { label: "Invoiced", tone: "blue" },
  paid: { label: "Paid", tone: "green" },
};

export const PLACEMENT_STATUS: Record<PlacementStatus, { label: string; tone: Tone }> = {
  active: { label: "Active", tone: "green" },
  inactive_client_cancelled: { label: "Client cancelled", tone: "red" },
  inactive_campaign_cancelled: { label: "Campaign cancelled", tone: "red" },
  replaced: { label: "Replaced", tone: "amber" },
};

export const PIPELINE_LABEL: Record<string, string> = {
  ai: "AI Receptionist",
  va: "Virtual Assistant",
};
