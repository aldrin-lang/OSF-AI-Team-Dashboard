import "server-only";
import { getAdminSupabase } from "@/lib/supabase/server";
import { notifyUsers } from "@/lib/server/notify";
import {
  assignUnassigned,
  getLiveFrom,
  ingestLead,
  syncFromGhl,
  type GhlConfig,
  type IngestResult,
  type SyncResult,
} from "@/lib/leads-ingest";
import type { IncomingLead } from "@/lib/leads-core";

/** GHL credentials for the read-only sync. Null when not configured. */
// "ALatest Leads" in the OutsourceForce.ai location: every new lead lands here first; GHL then
// copies it into other pipelines (Outsource Leads Pipeline, Latest Leads – <setter>), so sync only this one.
const DEFAULT_LEADS_PIPELINE_ID = "2aIn5QLMcNZFyblSdy4p";

export function ghlConfigFromEnv(): GhlConfig | null {
  const token = process.env.GHL_API_TOKEN;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!token || !locationId) return null;
  return { token, locationId, pipelineId: process.env.GHL_PIPELINE_ID || DEFAULT_LEADS_PIPELINE_ID };
}

/** A lead pushed by the GHL workflow webhook. Notifies the setter if they have a dashboard login. */
export async function ingestFromWebhook(lead: IncomingLead): Promise<IngestResult> {
  const db = getAdminSupabase();
  const liveFrom = await getLiveFrom(db);
  const res = await ingestLead(db, lead, { via: "webhook", liveFrom });
  if (res.created && res.setterProfileId) {
    await notifyUsers({
      userIds: [res.setterProfileId],
      event: "assigned_to_me",
      title: `New lead: ${res.leadName || "unnamed lead"}`,
      body: [lead.source, lead.tags.length ? lead.tags.join(", ") : null].filter(Boolean).join(" · ") || undefined,
      link: `/leads/${res.leadId}`,
    });
  }
  return res;
}

/** "Sync now": pull the last few days from GHL (read-only) and ingest anything missing. */
export async function runSync(days = 3): Promise<SyncResult | { error: string }> {
  const cfg = ghlConfigFromEnv();
  if (!cfg) return { error: "GHL_API_TOKEN / GHL_LOCATION_ID are not set on the server." };
  return syncFromGhl(getAdminSupabase(), cfg, { days, withContactDetails: true, via: "sync" });
}

export async function runAssignUnassigned(): Promise<number> {
  const db = getAdminSupabase();
  return assignUnassigned(db, await getLiveFrom(db));
}
