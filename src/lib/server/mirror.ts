import "server-only";
import { cache } from "react";
import { getServerSupabase } from "@/lib/supabase/server";
import { assembleRows, type MirrorGrid, type MirrorMeta } from "@/lib/mirror";
import type { MirrorTabInfo } from "@/lib/departments";

/** Sheet tabs this person can read, for the menu (RLS filters by department access). */
export const getMirrorTabs = cache(async (): Promise<MirrorTabInfo[]> => {
  const supabase = await getServerSupabase();
  const { data } = await supabase.from("sheet_mirror").select("key, department, label, position").gt("parts", 0);
  return (data ?? []) as MirrorTabInfo[];
});

/** One synced tab with all its rows, or null when it doesn't exist or isn't shared with this person. */
export async function getMirror(key: string): Promise<MirrorGrid | null> {
  const supabase = await getServerSupabase();
  const { data: meta } = await supabase.from("sheet_mirror").select("*").eq("key", key).maybeSingle();
  if (!meta || !meta.parts) return null;
  const { data: parts } = await supabase
    .from("sheet_mirror_parts")
    .select("part, styles, rows")
    .eq("key", key)
    .eq("sync_id", meta.sync_id)
    .order("part");
  return { meta: meta as MirrorMeta, rows: assembleRows(parts ?? []) };
}
