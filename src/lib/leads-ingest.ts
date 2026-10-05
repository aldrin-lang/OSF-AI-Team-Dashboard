// Lead ingestion shared by the webhook, the "Sync now" button and the backfill
// script. Takes a Supabase client (service role) so it has no Next.js imports.
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  analysePhone,
  classifyService,
  ghlKeyFor,
  validIso,
  type IncomingLead,
  type LeadService,
} from "./leads-core";

type Db = SupabaseClient;

export type IngestVia = "webhook" | "sync" | "backfill";

export interface IngestResult {
  leadId: string;
  created: boolean;
  historical: boolean;
  setterId: string | null;
  setterName: string | null;
  setterProfileId: string | null;
  leadName: string;
}

export const OPEN_STATUSES = ["new", "contacted", "call_booked", "no_answer"] as const;

export async function getLiveFrom(db: Db): Promise<string | null> {
  const { data } = await db.from("lead_settings").select("live_from").eq("id", 1).maybeSingle();
  return (data?.live_from as string | null | undefined) ?? null;
}

async function addEvent(
  db: Db,
  leadId: string,
  kind: string,
  summary: string,
  detail?: Record<string, unknown>,
) {
  try {
    await db.from("lead_events").insert({ lead_id: leadId, kind, summary, detail: detail ?? null });
  } catch {
    /* history is best-effort; never fail an ingest because of it */
  }
}

/** Ask the database for the next setter (round-robin). Null = nobody on duty. The DB logs the 'assigned' event. */
async function allocate(db: Db, leadId: string) {
  const { data, error } = await db.rpc("allocate_lead", { p_lead_id: leadId });
  if (error) throw new Error(`allocate_lead failed: ${error.message}`);
  const setterId = (data as string | null) ?? null;
  if (!setterId) return { setterId: null, setterName: null, setterProfileId: null };
  const { data: s } = await db.from("setters").select("name, profile_id").eq("id", setterId).maybeSingle();
  return {
    setterId,
    setterName: (s?.name as string | undefined) ?? null,
    setterProfileId: (s?.profile_id as string | undefined) ?? null,
  };
}

function nonEmpty<T extends Record<string, unknown>>(o: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === null || v === undefined || v === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out as Partial<T>;
}

/**
 * Create or refresh one lead (idempotent on the GHL opportunity / contact id).
 * - New lead  -> inserted, then allocated to a setter IF allocation is live and
 *                the lead was created after `liveFrom`; otherwise it is stored
 *                as historical and left unassigned.
 * - Existing  -> contact details refreshed; status, setter and notes are never
 *                overwritten.
 */
export async function ingestLead(
  db: Db,
  lead: IncomingLead,
  opts: { via: IngestVia; liveFrom: string | null },
): Promise<IngestResult> {
  const key = ghlKeyFor(lead);
  if (!key) throw new Error("Lead has no GHL contact or opportunity id");

  const phone = analysePhone(lead.phone);
  const service: LeadService = classifyService(lead.tags, lead.vaRole);
  const createdIso = validIso(lead.createdAt) ?? new Date().toISOString();
  const historical = opts.liveFrom === null || Date.parse(createdIso) < Date.parse(opts.liveFrom);
  const now = new Date().toISOString();

  const base = {
    ghl_contact_id: lead.contactId,
    ghl_opportunity_id: lead.opportunityId,
    ghl_assigned_to: lead.ghlAssignedTo,
    name: lead.name,
    email: lead.email,
    phone_raw: lead.phone,
    phone: phone.phone,
    phone_suggested: phone.suggested,
    phone_flag: phone.flag,
    source: lead.source,
    va_role: lead.vaRole,
    job_description: lead.jobDescription,
    tags: lead.tags,
    custom: lead.custom,
    last_synced_at: now,
  };

  const findExisting = async () => {
    const { data, error } = await db
      .from("leads")
      .select("id, name, service, setter_id, historical")
      .eq("ghl_key", key)
      .maybeSingle();
    if (error) throw new Error(`lead lookup failed: ${error.message}`);
    return data as { id: string; name: string; service: LeadService; setter_id: string | null; historical: boolean } | null;
  };

  const refresh = async (existing: NonNullable<Awaited<ReturnType<typeof findExisting>>>): Promise<IngestResult> => {
    const patch = {
      ...nonEmpty(base),
      // never downgrade a known service to "unknown"
      service: service !== "unknown" ? service : existing.service,
      last_synced_at: now,
    };
    // keep the opportunity the lead first arrived with (GHL copies it into other pipelines)
    delete patch.ghl_opportunity_id;
    const { error } = await db.from("leads").update(patch).eq("id", existing.id);
    if (error) throw new Error(`lead update failed: ${error.message}`);

    let assigned = { setterId: existing.setter_id as string | null, setterName: null as string | null, setterProfileId: null as string | null };
    if (!existing.setter_id && !existing.historical && opts.liveFrom !== null) {
      assigned = await allocate(db, existing.id);
    }
    return {
      leadId: existing.id,
      created: false,
      historical: existing.historical,
      ...assigned,
      leadName: lead.name || existing.name,
    };
  };

  const existing = await findExisting();
  if (existing) return refresh(existing);

  const { data: inserted, error } = await db
    .from("leads")
    .insert({
      ghl_key: key,
      ...base,
      service,
      status: "new",
      historical,
      ghl_created_at: validIso(lead.createdAt),
      received_at: validIso(lead.createdAt) ?? now,
    })
    .select("id")
    .single();

  if (error) {
    // Two deliveries raced: the other one won. Treat ours as a refresh.
    if (error.code === "23505") {
      const again = await findExisting();
      if (again) return refresh(again);
    }
    throw new Error(`lead insert failed: ${error.message}`);
  }

  const leadId = inserted.id as string;
  await addEvent(db, leadId, "received", `Received via ${opts.via}`, {
    via: opts.via,
    source: lead.source,
    service,
    historical,
  });

  let assigned: Awaited<ReturnType<typeof allocate>> = { setterId: null, setterName: null, setterProfileId: null };
  if (!historical) {
    assigned = await allocate(db, leadId);
  }

  return { leadId, created: true, historical, ...assigned, leadName: lead.name };
}

/** Give a setter to every open, non-historical lead that has none (e.g. everyone was switched off). */
export async function assignUnassigned(db: Db, liveFrom: string | null): Promise<number> {
  if (liveFrom === null) return 0;
  const { data } = await db
    .from("leads")
    .select("id")
    .is("setter_id", null)
    .eq("historical", false)
    .in("status", [...OPEN_STATUSES])
    .order("received_at", { ascending: true })
    .limit(200);
  let n = 0;
  for (const row of data ?? []) {
    const a = await allocate(db, row.id as string);
    if (a.setterId) n++;
  }
  return n;
}

// ---------------------------------------------------------------------------
// Read-only pull from GHL (opportunities in the leads pipeline)
// ---------------------------------------------------------------------------

export interface GhlConfig {
  token: string;
  locationId: string;
  pipelineId?: string | null;
}

export interface SyncOptions {
  days?: number;
  maxOpportunities?: number;
  /** Also fetch each contact to read the website form's VA fields (slower). */
  withContactDetails?: boolean;
  via?: IngestVia;
}

export interface SyncResult {
  fetched: number;
  inWindow: number;
  created: number;
  updated: number;
  historical: number;
  errors: string[];
}

// Contact custom-field ids in the OutsourceForce.ai location (read once from GHL).
const VA_ROLE_FIELD_IDS = [
  "JYOdU2mBLeXh9HxJBzel", // What VA are you looking for?
  "bOybzJgbCVOfSTENAItp", // What type of VA do you want to HIRE?
  "QAo8UqXho2hDhZPscYg2", // What VA position are you looking for?
  "XfJR0EB6gYwENhsIVuJ4", // …looking to fill?
  "knbmdNStQHQ9iNJ5ogf1", // …looking to fill?(New)
  "I0G89oJhppMcm3dHufPy", // …looking for new?
  "jfmW0xOnJsBmDo9heup1", // VA Profession Required
  "jRGoIwg8m2PHNyERqHpE", // …(Appointment Setter)
  "29nJYTF2hmszNLytm8GQ", // …(with Junior VA)
  "4JjscyJiNHfB907FGLAU", // …(One stop)
  "9h0ftaL3jOvkifrfeskI", // …(05-06-2026)
  "Zqsg1OXQWIwPBAOnLkmC", // …(w/ PMA)
];
const JOB_FIELD_IDS = ["90yXRnukD9yrByH7R4vr", "h3lWEz8HTCKcmSBMQS9K"]; // Job description details / Job Description

const GHL_BASE = "https://services.leadconnectorhq.com";

async function ghlGet(cfg: GhlConfig, path: string, params: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const url = `${GHL_BASE}${path}?${new URLSearchParams(params).toString()}`;
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${cfg.token}`, Version: "2021-07-28", Accept: "application/json" },
      cache: "no-store",
    });
    if (res.ok) return (await res.json()) as Record<string, unknown>;
    lastStatus = res.status;
    if (res.status !== 429 && res.status < 500) break;
    await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
  }
  throw new Error(`GHL ${path} returned ${lastStatus}`);
}

interface GhlOpportunity {
  id: string;
  name?: string;
  source?: string;
  assignedTo?: string;
  createdAt: string;
  contactId?: string;
  contact?: { id?: string; name?: string; email?: string; phone?: string; tags?: string[] };
}

function fieldValue(customFields: unknown, ids: string[]): string | null {
  if (!Array.isArray(customFields)) return null;
  for (const id of ids) {
    const f = customFields.find((x) => x && typeof x === "object" && (x as { id?: string }).id === id) as
      | { value?: unknown }
      | undefined;
    const v = f?.value;
    const s = Array.isArray(v) ? v.join(", ") : typeof v === "string" ? v : v == null ? "" : String(v);
    if (s.trim()) return s.trim();
  }
  return null;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        const i = next++;
        out[i] = await fn(items[i]);
      }
    }),
  );
  return out;
}

/**
 * Pull recent opportunities from GHL (newest first) and ingest them oldest
 * first, so allocation follows arrival order. READ-ONLY against GHL.
 */
export async function syncFromGhl(db: Db, cfg: GhlConfig, opts: SyncOptions = {}): Promise<SyncResult> {
  const days = opts.days ?? 3;
  const max = opts.maxOpportunities ?? 2000;
  const cutoff = Date.now() - days * 86_400_000;
  const result: SyncResult = { fetched: 0, inWindow: 0, created: 0, updated: 0, historical: 0, errors: [] };

  const collected: GhlOpportunity[] = [];
  let cursor: { startAfter: string; startAfterId: string } | null = null;
  let done = false;
  while (!done) {
    const params: Record<string, string> = { location_id: cfg.locationId, limit: "100" };
    if (cfg.pipelineId) params.pipeline_id = cfg.pipelineId;
    if (cursor) Object.assign(params, cursor);
    const res = await ghlGet(cfg, "/opportunities/search", params);
    const ops = (res.opportunities as GhlOpportunity[] | undefined) ?? [];
    if (ops.length === 0) break;
    for (const o of ops) {
      result.fetched++;
      if (Date.parse(o.createdAt) < cutoff) {
        done = true;
        break;
      }
      collected.push(o);
      if (collected.length >= max) {
        done = true;
        break;
      }
    }
    const meta = res.meta as { startAfter?: number; startAfterId?: string } | undefined;
    if (done || !meta?.startAfter || !meta.startAfterId) break;
    cursor = { startAfter: String(meta.startAfter), startAfterId: meta.startAfterId };
  }
  result.inWindow = collected.length;
  collected.reverse(); // oldest first

  const details = opts.withContactDetails
    ? await mapLimit(collected, 4, async (o) => {
        const id = o.contactId ?? o.contact?.id;
        if (!id) return null;
        try {
          const r = await ghlGet(cfg, `/contacts/${id}`);
          return ((r.contact as { customFields?: unknown } | undefined)?.customFields ?? null) as unknown;
        } catch {
          return null;
        }
      })
    : collected.map(() => null);

  const liveFrom = await getLiveFrom(db);
  for (let i = 0; i < collected.length; i++) {
    const o = collected[i];
    const cf = details[i];
    const incoming: IncomingLead = {
      contactId: o.contactId ?? o.contact?.id ?? null,
      opportunityId: o.id,
      name: o.contact?.name ?? o.name ?? "",
      email: o.contact?.email ?? null,
      phone: o.contact?.phone ?? null,
      source: o.source ?? null,
      tags: o.contact?.tags ?? [],
      vaRole: fieldValue(cf, VA_ROLE_FIELD_IDS),
      jobDescription: fieldValue(cf, JOB_FIELD_IDS),
      ghlAssignedTo: o.assignedTo ?? null,
      createdAt: o.createdAt,
      custom: {},
    };
    try {
      const r = await ingestLead(db, incoming, { via: opts.via ?? "sync", liveFrom });
      if (r.created) result.created++;
      else result.updated++;
      if (r.historical) result.historical++;
    } catch (e) {
      if (result.errors.length < 5) result.errors.push(e instanceof Error ? e.message : String(e));
    }
  }
  return result;
}
