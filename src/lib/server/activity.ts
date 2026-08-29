import "server-only";
import { getServerSupabase } from "@/lib/supabase/server";
import type { EntityType } from "@/lib/types";

/** Append an audit/feed entry via the SECURITY DEFINER log_activity() function. */
export async function logActivity(params: {
  entity: EntityType;
  entityId: string;
  verb: string;
  summary: string;
  changes?: Record<string, unknown> | null;
}) {
  const supabase = await getServerSupabase();
  await supabase.rpc("log_activity", {
    p_entity: params.entity,
    p_entity_id: params.entityId,
    p_verb: params.verb,
    p_summary: params.summary,
    p_changes: params.changes ?? null,
  });
}

/** Build a {field: {from, to}} diff for the fields that actually changed. */
export function diff<T extends object>(
  before: T,
  after: Partial<T>,
  fields: (keyof T)[],
): Record<string, { from: unknown; to: unknown }> {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  const b = before as Record<string, unknown>;
  const a = after as Record<string, unknown>;
  for (const f of fields) {
    const key = String(f);
    if (key in a && a[key] !== b[key]) {
      out[key] = { from: b[key], to: a[key] };
    }
  }
  return out;
}
