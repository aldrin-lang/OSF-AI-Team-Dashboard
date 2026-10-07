// Hand-maintained types mirroring supabase/migrations. Regenerate with the
// Supabase CLI (`supabase gen types typescript`) once the project exists.

export type UserRole = "admin" | "manager" | "member";
export type PipelineType = "ai" | "va";
export type ClientStatus =
  | "active"
  | "live"
  | "paused"
  | "withdrawn"
  | "rejected"
  | "churned";
export type RbStatus =
  | "not_started"
  | "docs_needed"
  | "submitted"
  | "approved"
  | "rejected";
export type BuildStatus =
  | "not_started"
  | "in_progress"
  | "submitted"
  | "approved"
  | "rejected";
export type ChecklistStatus = "todo" | "doing" | "done" | "blocked" | "na";
export type TaskStatus = "open" | "done";
export type ConcernStatus = "open" | "in_progress" | "resolved";
export type ConcernSeverity = "low" | "medium" | "high" | "urgent";
export type PlacementStatus =
  | "active"
  | "inactive_client_cancelled"
  | "inactive_campaign_cancelled"
  | "replaced";
export type HiringFeeStatus = "not_applicable" | "pending" | "invoiced" | "paid";
export type DigestFreq = "off" | "daily" | "weekly";
export type EntityType = "client" | "concern";

export interface Profile {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  active: boolean;
  created_at: string;
}

export interface PipelineStage {
  id: string;
  pipeline: PipelineType;
  name: string;
  position: number;
  is_terminal: boolean;
  sla_days: number | null;
}

export interface Client {
  id: string;
  pipeline: PipelineType;
  name: string;
  company_name: string | null;
  contact_email: string | null;
  industry: string | null;
  country: string | null;
  source: string | null;
  closed_by: string | null;
  manager_id: string | null;
  demo_call_date: string | null;
  start_date: string | null;
  stage_id: string | null;
  stage_entered_at: string;
  status: ClientStatus;
  setup_fee: number | null;
  daily_rate: number | null;
  hiring_fee_status: HiringFeeStatus;
  hiring_fee_invoice: string | null;
  hiring_fee_paid: string | null;
  portal_url: string | null;
  checkin_every_days: number;
  checkin_paused: boolean;
  remarks: string | null;
  source_row_hash: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClientLine {
  id: string;
  client_id: string;
  label: string | null;
  ai_phone_number: string | null;
  twilio_subaccount: string | null;
  ghl_location_id: string | null;
  dashboard_url: string | null;
  booking_system: string | null;
  regulatory_bundle_status: RbStatus;
  prompt_status: BuildStatus;
  kb_status: BuildStatus;
  workflow_status: BuildStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface VaPlacement {
  id: string;
  client_id: string;
  va_name: string | null;
  va_email: string | null;
  va_cv_url: string | null;
  tracker_url: string | null;
  role: string | null;
  employment_type: string | null;
  placement_status: PlacementStatus;
  checkin_every_days: number;
  checkin_paused: boolean;
  va_phone: string | null;
  candidate_id: string | null;
  role_id: string | null;
  start_date: string | null;
  end_date: string | null;
  hourly_rate: number | null;
  rate_currency: string;
  hours_per_week: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type RoleStatus = "open" | "sourcing" | "interviewing" | "offer" | "filled" | "on_hold" | "cancelled";
export type RoleCandidateStage = "suggested" | "shortlisted" | "interview" | "offered" | "hired" | "rejected";
export type RolePriority = "low" | "normal" | "high" | "urgent";

/** An open role (job order) a client wants filled. */
export interface VaRole {
  id: string;
  client_id: string;
  title: string;
  headcount: number;
  employment_type: "full_time" | "part_time" | "project";
  hours_per_week: number | null;
  budget: string | null;
  start_by: string | null;
  status: RoleStatus;
  priority: RolePriority;
  requirements: string | null;
  owner_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface VaRoleCandidate {
  id: string;
  role_id: string;
  candidate_id: string;
  stage: RoleCandidateStage;
  match_score: number | null;
  notes: string | null;
  added_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface ChecklistItem {
  id: string;
  client_id: string;
  key: string;
  label: string;
  status: ChecklistStatus;
  owner_id: string | null;
  due_date: string | null;
  position: number;
  completed_at: string | null;
  completed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Task {
  id: string;
  client_id: string | null;
  title: string;
  notes: string | null;
  assignee_id: string | null;
  due_date: string | null;
  status: TaskStatus;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Concern {
  id: string;
  client_id: string;
  raised_by: string | null;
  raised_at: string;
  type: string | null;
  severity: ConcernSeverity;
  title: string;
  description: string | null;
  status: ConcernStatus;
  owner_id: string | null;
  resolution: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: string;
  entity: EntityType;
  entity_id: string;
  author_id: string | null;
  body: string;
  mentions: string[];
  created_at: string;
}

export interface ActivityRow {
  id: string;
  entity: EntityType;
  entity_id: string;
  actor_id: string | null;
  verb: string;
  summary: string;
  changes: Record<string, unknown> | null;
  created_at: string;
}

export interface NotificationRow {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export interface NotificationPreferences {
  user_id: string;
  assigned_to_me_in_app: boolean;
  assigned_to_me_email: boolean;
  mention_in_app: boolean;
  mention_email: boolean;
  stage_change_my_client_in_app: boolean;
  stage_change_my_client_email: boolean;
  concern_my_client_in_app: boolean;
  concern_my_client_email: boolean;
  stale_client_in_app: boolean;
  stale_client_email: boolean;
  digest: DigestFreq;
  updated_at: string;
}

export interface OptionRow {
  id: string;
  kind: "source" | "booking_system" | "concern_type" | "country" | "role";
  value: string;
  position: number;
  active: boolean;
}

export interface ChecklistTemplate {
  id: string;
  pipeline: PipelineType;
  key: string;
  label: string;
  position: number;
}

export interface StageGate {
  id: string;
  stage_id: string;
  required_checklist_key: string;
}

export type EmailStatus = "draft" | "sent";

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  body: string;
  trigger: string; // 'manual' | 'on_stage:<stage name>'
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClientEmail {
  id: string;
  client_id: string;
  template_id: string | null;
  to_email: string | null;
  subject: string;
  body: string;
  status: EmailStatus;
  created_by: string | null;
  sent_by: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Leads
// ---------------------------------------------------------------------------
import type { LeadService } from "@/lib/leads-core";
export type { LeadService };

export type LeadStatus =
  | "new"
  | "contacted"
  | "call_booked"
  | "no_answer"
  | "not_interested"
  | "won"
  | "lost";

export interface Setter {
  id: string;
  name: string;
  ghl_user_id: string | null;
  email: string | null;
  profile_id: string | null;
  active: boolean;
  last_assigned_at: string | null;
  last_assign_seq: number | null;
  created_at: string;
}

export interface Lead {
  id: string;
  ghl_key: string;
  ghl_contact_id: string | null;
  ghl_opportunity_id: string | null;
  ghl_assigned_to: string | null;
  name: string;
  email: string | null;
  phone_raw: string | null;
  phone: string | null;
  phone_suggested: string | null;
  phone_flag: "likely_miscoded_353" | "no_country_code" | null;
  source: string | null;
  service: LeadService;
  va_role: string | null;
  job_description: string | null;
  tags: string[];
  custom: Record<string, unknown>;
  status: LeadStatus;
  setter_id: string | null;
  assigned_at: string | null;
  assigned_by: string | null;
  notes: string | null;
  historical: boolean;
  client_id: string | null;
  country: string | null;
  ad_name: string | null;
  ad_code: string | null;
  intake_form: string | null;
  call_notes: string | null;
  extras_synced_at: string | null;
  ghl_created_at: string | null;
  received_at: string;
  last_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeadEvent {
  id: string;
  lead_id: string;
  kind: string;
  summary: string;
  detail: Record<string, unknown> | null;
  actor_id: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Ops automations: candidates, check-ins, invoices, daily report
// ---------------------------------------------------------------------------
export type CandidateStatus = "new" | "screened" | "shortlisted" | "interview" | "hired" | "rejected";

export interface Candidate {
  id: string;
  external_key: string | null;
  full_name: string;
  email: string | null;
  phone: string | null;
  country: string | null;
  source: string | null;
  applied_role: string | null;
  experience: string | null;
  hourly_rate: string | null;
  availability: string | null;
  cv_url: string | null;
  portfolio_url: string | null;
  answers: Record<string, string>;
  ai_score: number | null;
  ai_recommended_role: string | null;
  ai_alt_roles: string[];
  ai_summary: string | null;
  ai_strengths: string[];
  ai_concerns: string[];
  ai_screened_at: string | null;
  ai_error: string | null;
  status: CandidateStatus;
  recommendation_sent_at: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export type CheckinKind = "client" | "va";
export type CheckinStatus = "due" | "sent" | "replied" | "done" | "skipped";
export type CheckinMood = "good" | "neutral" | "at_risk";

export interface Checkin {
  id: string;
  kind: CheckinKind;
  client_id: string;
  placement_id: string | null;
  due_on: string;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  channel: "email" | "whatsapp" | "call";
  status: CheckinStatus;
  subject: string | null;
  message: string | null;
  sent_at: string | null;
  sent_by: string | null;
  reply: string | null;
  mood: CheckinMood | null;
  ai_summary: string | null;
  follow_up: string | null;
  created_at: string;
  updated_at: string;
}

export type InvoiceStatus = "open" | "paid" | "void";

export interface Invoice {
  id: string;
  client_id: string;
  number: string;
  description: string | null;
  amount: number;
  currency: string;
  issued_on: string;
  due_on: string;
  status: InvoiceStatus;
  paid_on: string | null;
  bill_to_email: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PaymentReminder {
  id: string;
  invoice_id: string;
  stage: "before_due" | "due_today" | "overdue_3" | "overdue_7" | "overdue_14" | "manual";
  subject: string;
  body: string;
  status: "draft" | "sent" | "skipped";
  sent_at: string | null;
  sent_by: string | null;
  created_at: string;
}

export interface DailyReport {
  id: string;
  report_date: string;
  metrics: Record<string, unknown>;
  summary: string | null;
  emailed_at: string | null;
  created_at: string;
}
