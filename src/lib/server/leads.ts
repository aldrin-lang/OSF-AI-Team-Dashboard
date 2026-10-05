import "server-only";
import { getAdminSupabase } from "@/lib/supabase/server";
import { notifyUsers } from "@/lib/server/notify";
import {
  assignUnassigned,
  fieldValue,
  ghlGet,
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

// Contact custom fields shown on the lead page (OutsourceForce.ai location).
const INTAKE_FIELD = "za6vmrWGElsdZSgxgiWP"; // Client AI Intake Form
const CALL_SUMMARY_FIELD = "0t8X6ygHRhKhvCwxtmBp"; // AI Call Summary (Peter)
const CALLBACK_TIME_FIELD = "12LldrtLbjFO8zGtz2f3";
const CALLBACK_DATE_FIELD = "jhT6pK6muHfkzt5Gv0FK";
const EXTRAS_MAX_AGE_MS = 15 * 60 * 1000;

/**
 * Read the intake form and AI call notes from GHL (GET only) and cache them
 * on the lead. Skips when fresh unless forced. Never throws.
 */
export async function refreshLeadExtras(
  lead: { id: string; ghl_contact_id: string | null; extras_synced_at: string | null },
  force = false,
): Promise<{ intake_form: string | null; call_notes: string | null } | null> {
  const cfg = ghlConfigFromEnv();
  if (!cfg || !lead.ghl_contact_id) return null;
  if (!force && lead.extras_synced_at && Date.now() - new Date(lead.extras_synced_at).getTime() < EXTRAS_MAX_AGE_MS) {
    return null;
  }
  try {
    const r = await ghlGet(cfg, `/contacts/${lead.ghl_contact_id}`);
    const cf = (r.contact as { customFields?: unknown } | undefined)?.customFields;
    const summary = fieldValue(cf, [CALL_SUMMARY_FIELD]);
    const cbDate = fieldValue(cf, [CALLBACK_DATE_FIELD]);
    const cbTime = fieldValue(cf, [CALLBACK_TIME_FIELD]);
    const callback = cbDate || cbTime ? `Callback requested: ${[cbDate, cbTime].filter(Boolean).join(" ")}` : null;
    const extras = {
      intake_form: fieldValue(cf, [INTAKE_FIELD]),
      call_notes: [summary, callback].filter(Boolean).join("\n\n") || null,
    };
    await getAdminSupabase()
      .from("leads")
      .update({ ...extras, extras_synced_at: new Date().toISOString() })
      .eq("id", lead.id);
    return extras;
  } catch (e) {
    console.error("[leads] extras fetch failed", e);
    return null;
  }
}
