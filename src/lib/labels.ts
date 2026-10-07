import type {
  BuildStatus,
  ChecklistStatus,
  ClientStatus,
  ConcernSeverity,
  ConcernStatus,
  HiringFeeStatus,
  CandidateStatus,
  CheckinMood,
  CheckinStatus,
  LeadService,
  LeadStatus,
  PlacementStatus,
  RoleStatus,
  RoleCandidateStage,
  RolePriority,
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

export const LEAD_STATUS: Record<LeadStatus, { label: string; tone: Tone }> = {
  new: { label: "New", tone: "blue" },
  contacted: { label: "Contacted", tone: "purple" },
  call_booked: { label: "Call booked", tone: "green" },
  no_answer: { label: "No answer", tone: "amber" },
  not_interested: { label: "Not interested", tone: "neutral" },
  won: { label: "Won", tone: "green" },
  lost: { label: "Lost", tone: "red" },
};

export const LEAD_SERVICE: Record<LeadService, { label: string; tone: Tone }> = {
  ai: { label: "AI receptionist", tone: "blue" },
  va: { label: "VA", tone: "purple" },
  premium: { label: "Premium VA", tone: "amber" },
  unknown: { label: "Unknown", tone: "neutral" },
};

export const CANDIDATE_STATUS: Record<CandidateStatus, { label: string; tone: Tone }> = {
  new: { label: "New", tone: "blue" },
  screened: { label: "AI screened", tone: "purple" },
  shortlisted: { label: "Shortlisted", tone: "green" },
  interview: { label: "Interview", tone: "amber" },
  hired: { label: "Hired", tone: "green" },
  rejected: { label: "Rejected", tone: "neutral" },
};

export const CHECKIN_STATUS: Record<CheckinStatus, { label: string; tone: Tone }> = {
  due: { label: "To send", tone: "amber" },
  sent: { label: "Awaiting reply", tone: "blue" },
  replied: { label: "Replied", tone: "purple" },
  done: { label: "Done", tone: "green" },
  skipped: { label: "Skipped", tone: "neutral" },
};

export const CHECKIN_MOOD: Record<CheckinMood, { label: string; tone: Tone }> = {
  good: { label: "Happy", tone: "green" },
  neutral: { label: "Neutral", tone: "neutral" },
  at_risk: { label: "At risk", tone: "red" },
};

export const ROLE_STATUS: Record<RoleStatus, { label: string; tone: Tone }> = {
  open: { label: "Open", tone: "blue" },
  sourcing: { label: "Sourcing", tone: "purple" },
  interviewing: { label: "Interviewing", tone: "amber" },
  offer: { label: "Offer out", tone: "amber" },
  filled: { label: "Filled", tone: "green" },
  on_hold: { label: "On hold", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "red" },
};

export const ROLE_STAGE: Record<RoleCandidateStage, { label: string; tone: Tone }> = {
  suggested: { label: "Suggested", tone: "neutral" },
  shortlisted: { label: "Shortlisted", tone: "blue" },
  interview: { label: "Interview", tone: "purple" },
  offered: { label: "Offered", tone: "amber" },
  hired: { label: "Hired", tone: "green" },
  rejected: { label: "Rejected", tone: "red" },
};

export const ROLE_PRIORITY: Record<RolePriority, { label: string; tone: Tone }> = {
  low: { label: "Low", tone: "neutral" },
  normal: { label: "Normal", tone: "blue" },
  high: { label: "High", tone: "amber" },
  urgent: { label: "Urgent", tone: "red" },
};

export const EMPLOYMENT_TYPE: Record<"full_time" | "part_time" | "project", string> = {
  full_time: "Full time",
  part_time: "Part time",
  project: "Project",
};
