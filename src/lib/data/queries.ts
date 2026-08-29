import { getServerSupabase } from "@/lib/supabase/server";
import {
  getStagesCached,
  getStageGatesCached,
  getOptionsCached,
  getProfilesCached,
} from "@/lib/data/cached";
import type {
  ActivityRow,
  ChecklistItem,
  Client,
  ClientEmail,
  ClientLine,
  Comment,
  Concern,
  EmailTemplate,
  PipelineStage,
  PipelineType,
  Profile,
  StageGate,
  Task,
  VaPlacement,
} from "@/lib/types";

export async function getProfiles(): Promise<Profile[]> {
  return getProfilesCached();
}

export async function getStages(pipeline?: PipelineType): Promise<PipelineStage[]> {
  const all = await getStagesCached();
  return pipeline ? all.filter((s) => s.pipeline === pipeline) : all;
}

export async function getStageGates(): Promise<StageGate[]> {
  return getStageGatesCached();
}

export interface ClientListFilters {
  pipeline: PipelineType;
  managerId?: string;
  country?: string;
  source?: string;
  stageId?: string;
  status?: string;
  search?: string;
  activeOnly?: boolean;
}

export async function getClients(filters: ClientListFilters): Promise<Client[]> {
  const supabase = await getServerSupabase();
  let q = supabase.from("clients").select("*").eq("pipeline", filters.pipeline);
  if (filters.managerId) q = q.eq("manager_id", filters.managerId);
  if (filters.country) q = q.eq("country", filters.country);
  if (filters.source) q = q.eq("source", filters.source);
  if (filters.stageId) q = q.eq("stage_id", filters.stageId);
  if (filters.status) q = q.eq("status", filters.status);
  else if (filters.activeOnly) q = q.not("status", "in", "(withdrawn,rejected,churned)");
  if (filters.search) q = q.ilike("name", `%${filters.search}%`);
  const { data } = await q.order("updated_at", { ascending: false });
  return (data as Client[]) ?? [];
}

export interface ClientDetail {
  client: Client;
  lines: ClientLine[];
  placements: VaPlacement[];
  checklist: ChecklistItem[];
  tasks: Task[];
  concerns: Concern[];
  stage: PipelineStage | null;
  emails: ClientEmail[];
  templates: EmailTemplate[];
}

export async function getClientDetail(id: string): Promise<ClientDetail | null> {
  const supabase = await getServerSupabase();
  const { data: client } = await supabase
    .from("clients")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!client) return null;

  const [lines, placements, checklist, tasks, concerns, stages, emails, templates] =
    await Promise.all([
      supabase.from("client_lines").select("*").eq("client_id", id).order("created_at"),
      supabase.from("va_placements").select("*").eq("client_id", id).order("created_at"),
      supabase.from("checklist_items").select("*").eq("client_id", id).order("position"),
      supabase.from("tasks").select("*").eq("client_id", id).order("created_at", { ascending: false }),
      supabase.from("concerns").select("*").eq("client_id", id).order("raised_at", { ascending: false }),
      supabase.from("pipeline_stages").select("*").eq("id", (client as Client).stage_id ?? ""),
      supabase.from("client_emails").select("*").eq("client_id", id).order("created_at", { ascending: false }),
      supabase.from("email_templates").select("*").eq("active", true).order("name"),
    ]);

  return {
    client: client as Client,
    lines: (lines.data as ClientLine[]) ?? [],
    placements: (placements.data as VaPlacement[]) ?? [],
    checklist: (checklist.data as ChecklistItem[]) ?? [],
    tasks: (tasks.data as Task[]) ?? [],
    concerns: (concerns.data as Concern[]) ?? [],
    stage: ((stages.data as PipelineStage[]) ?? [])[0] ?? null,
    emails: (emails.data as ClientEmail[]) ?? [],
    templates: (templates.data as EmailTemplate[]) ?? [],
  };
}

export async function getClientFeed(
  entityId: string,
  entity: "client" | "concern" = "client",
): Promise<{ activity: ActivityRow[]; comments: Comment[] }> {
  const supabase = await getServerSupabase();
  const [activity, comments] = await Promise.all([
    supabase
      .from("activity_log")
      .select("*")
      .eq("entity", entity)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("comments")
      .select("*")
      .eq("entity", entity)
      .eq("entity_id", entityId)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  return {
    activity: (activity.data as ActivityRow[]) ?? [],
    comments: (comments.data as Comment[]) ?? [],
  };
}

export async function getGlobalActivity(limit = 100): Promise<ActivityRow[]> {
  const supabase = await getServerSupabase();
  const { data } = await supabase
    .from("activity_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as ActivityRow[]) ?? [];
}

export async function getOptions(kind: string): Promise<string[]> {
  return getOptionsCached(kind);
}

export function profileMap(profiles: Profile[]): Map<string, Profile> {
  return new Map(profiles.map((p) => [p.id, p]));
}

export async function getClientsMini(): Promise<
  { id: string; name: string; country: string | null; stage: string | null }[]
> {
  const supabase = await getServerSupabase();
  const [{ data }, stages] = await Promise.all([
    supabase
      .from("clients")
      .select("id, name, company_name, country, stage_id")
      .eq("pipeline", "ai")
      .order("name"),
    getStages("ai"),
  ]);
  const stageName = new Map(stages.map((s) => [s.id, s.name]));
  return (
    (data as {
      id: string;
      name: string;
      company_name: string | null;
      country: string | null;
      stage_id: string | null;
    }[]) ?? []
  ).map((c) => ({
    id: c.id,
    name: c.company_name || c.name,
    country: c.country,
    stage: c.stage_id ? stageName.get(c.stage_id) ?? null : null,
  }));
}
