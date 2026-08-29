import { unstable_cache } from "next/cache";
import { getAdminSupabase } from "@/lib/supabase/server";
import type { OptionRow, PipelineStage, Profile, StageGate } from "@/lib/types";

// Small, non-sensitive lookups that rarely change. Served from a service-role
// client so they can be cached across requests (cookies aren't involved).
// Invalidate with revalidateTag("lookups") from admin mutations.

export const getStagesCached = unstable_cache(
  async (): Promise<PipelineStage[]> => {
    const db = getAdminSupabase();
    const { data } = await db.from("pipeline_stages").select("*").order("position");
    return (data as PipelineStage[]) ?? [];
  },
  ["pipeline_stages"],
  { tags: ["lookups"], revalidate: 600 },
);

export const getStageGatesCached = unstable_cache(
  async (): Promise<StageGate[]> => {
    const db = getAdminSupabase();
    const { data } = await db.from("stage_gates").select("*");
    return (data as StageGate[]) ?? [];
  },
  ["stage_gates"],
  { tags: ["lookups"], revalidate: 600 },
);

export const getOptionsCached = unstable_cache(
  async (kind: string): Promise<string[]> => {
    const db = getAdminSupabase();
    const { data } = await db
      .from("option_lists")
      .select("value")
      .eq("kind", kind)
      .eq("active", true)
      .order("position");
    return ((data as { value: string }[]) ?? []).map((r) => r.value);
  },
  ["option_lists"],
  { tags: ["lookups"], revalidate: 600 },
);

export const getProfilesCached = unstable_cache(
  async (): Promise<Profile[]> => {
    const db = getAdminSupabase();
    const { data } = await db.from("profiles").select("*").order("full_name");
    return (data as Profile[]) ?? [];
  },
  ["profiles"],
  { tags: ["profiles"], revalidate: 120 },
);

export type { OptionRow };
