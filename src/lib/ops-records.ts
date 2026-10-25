/**
 * VA Managers + Recruitment records: the statuses, their tabs, and how the team's sheet labels
 * map onto them (used by the one-time import and by the pages). Pure helpers, no I/O.
 */

// ---------------------------------------------------------------- Recruitment › Client requests
export const ROLE_STAGES = ["cv_pooling", "ready", "endorsed", "interview", "pending_decision", "paused", "live", "withdrawn"] as const;
export type RoleStage = (typeof ROLE_STAGES)[number];
export const ROLE_STAGE_LABEL: Record<RoleStage, string> = {
  cv_pooling: "CV pooling",
  ready: "Ready to endorse",
  endorsed: "Endorsed",
  interview: "Interview",
  pending_decision: "Pending decision",
  paused: "Paused / follow-up",
  live: "VA live",
  withdrawn: "Withdrawn",
};
/** Roel's numbered endorsement labels ("5 For Rescheduling", "9.1 Withdrawn") → stage. */
export function roleStageFrom(endorsement: string, opportunity: string): RoleStage {
  const m = endorsement.trim().match(/^(\d+(?:\.\d+)?)/);
  const n = m ? m[1] : "";
  if (n === "1" || n === "1.1") return "cv_pooling";
  if (n === "2") return "ready";
  if (n === "3") return "endorsed";
  if (n === "4" || n === "5" || n === "6") return "interview";
  if (n === "7") return "pending_decision";
  if (n === "8" || n === "9.3") return "paused";
  if (n === "9") return "live";
  if (n === "9.1") return "withdrawn";
  const o = opportunity.toLowerCase();
  if (o.includes("live")) return "live";
  if (o.includes("lost")) return "withdrawn";
  return "cv_pooling";
}
/** The older role_status kept in step with the stage (the Open roles page reads it). */
export function roleStatusFor(stage: RoleStage): "open" | "sourcing" | "interviewing" | "filled" | "on_hold" | "cancelled" {
  if (stage === "live") return "filled";
  if (stage === "withdrawn") return "cancelled";
  if (stage === "paused") return "on_hold";
  if (stage === "interview" || stage === "pending_decision") return "interviewing";
  if (stage === "endorsed" || stage === "ready") return "sourcing";
  return "open";
}

// ---------------------------------------------------------------- Recruitment › Onboarding + hiring fees
export const OB_STATUSES = ["to_schedule", "scheduled", "done", "withdrawn"] as const;
export type ObStatus = (typeof OB_STATUSES)[number];
export const OB_LABEL: Record<ObStatus, string> = { to_schedule: "To schedule", scheduled: "Scheduled", done: "Done", withdrawn: "Withdrawn" };
export function obStatusFrom(label: string): ObStatus {
  const l = label.trim().toLowerCase();
  if (l === "done") return "done";
  if (l === "scheduled") return "scheduled";
  if (l.startsWith("withdrawn")) return "withdrawn";
  return "to_schedule"; // For Scheduling, Waiting for Availability, Rescheduled, MIA, blank
}

export const FEE_STATUSES = ["to_send", "charged", "paid", "na"] as const;
export type FeeStatus = (typeof FEE_STATUSES)[number];
export const FEE_LABEL: Record<FeeStatus, string> = { to_send: "To send", charged: "Charged", paid: "Paid", na: "Not applicable" };
export function feeStatusFrom(label: string): FeeStatus {
  const l = label.trim().toLowerCase();
  if (l === "paid") return "paid";
  if (l.includes("charge")) return "charged"; // "Charged by Maria"
  if (l.includes("not applicable") || l.includes("waive") || l.startsWith("withdrawn")) return "na";
  return "to_send"; // Pending, To be sent, For sending, blank
}

// ---------------------------------------------------------------- VA Managers
export const CHANGE_STATUSES = ["in_progress", "replaced", "cancelled", "withdrawn"] as const;
export type ChangeStatus = (typeof CHANGE_STATUSES)[number];
export const CHANGE_LABEL: Record<ChangeStatus, string> = { in_progress: "In progress", replaced: "Replaced", cancelled: "Cancelled", withdrawn: "Withdrawn" };
export function changeStatusFrom(label: string): ChangeStatus {
  const l = label.trim().toLowerCase();
  if (l === "replaced") return "replaced";
  if (l === "cancelled" || l === "inactive") return "cancelled";
  if (l === "withdrawn" || l === "unresponsive") return "withdrawn";
  return "in_progress"; // CV Pooling, Interview Scheduled, Pending Decision, Waiting for Client's Availability
}

export type VaStatus = "active" | "paused" | "inactive";
export const VA_STATUS_LABEL: Record<VaStatus, string> = { active: "Active", paused: "On pause", inactive: "Inactive" };
export function vaStatusFrom(label: string): VaStatus {
  const l = label.trim().toLowerCase();
  if (l === "active") return "active";
  if (l.includes("pause")) return "paused";
  return "inactive";
}
export function vaStatusOf(p: { placement_status: string; on_pause?: boolean | null }): VaStatus {
  if (p.placement_status !== "active") return "inactive";
  return p.on_pause ? "paused" : "active";
}

/** "Part - Time", "Full Time", "PartTime" → part_time / full_time (the placements' employment_type). */
export function employmentFrom(label: string): string | null {
  const l = label.toLowerCase().replace(/[^a-z]/g, "");
  if (l.startsWith("part")) return "part_time";
  if (l.startsWith("full")) return "full_time";
  return null;
}

// ---------------------------------------------------------------- Monthly check-ins
export type CheckinState = "due" | "overdue" | "done";
const pad = (n: number) => String(n).padStart(2, "0");

/** This month's check-in date for a client with a check-in day (31 → the month's last day). */
export function checkinDateFor(day: number, today: string): string {
  const [y, m] = today.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${pad(m)}-${pad(Math.min(Math.max(day, 1), last))}`;
}

/** Due / overdue / done for this month, from the client's day and whether a check-in was logged this month. */
export function checkinState(day: number, today: string, doneThisMonth: boolean): CheckinState {
  if (doneThisMonth) return "done";
  return checkinDateFor(day, today) < today ? "overdue" : "due";
}
