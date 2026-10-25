import "server-only";
import { cache } from "react";
import { getServerSupabase } from "@/lib/supabase/server";
import { assembleRows, type MirrorGrid, type MirrorMeta, type MirrorRow } from "@/lib/mirror";
import { allRows } from "@/lib/server/paged";
import type { DeptSheetInfo, MirrorTabInfo } from "@/lib/departments";

/** Sheet tabs this person can read, for the menu (RLS filters by department access). */
export const getMirrorTabs = cache(async (): Promise<MirrorTabInfo[]> => {
  const supabase = await getServerSupabase();
  const { data } = await supabase.from("sheet_mirror").select("key, department, label, position").gt("parts", 0);
  return (data ?? []) as MirrorTabInfo[];
});

/** Editable Sheets shared with a department, oldest first (they become that department's sub-tabs). */
export const getDeptSheets = cache(async (): Promise<DeptSheetInfo[]> => {
  const supabase = await getServerSupabase();
  const { data } = await supabase
    .from("sheets")
    .select("id, name, departments")
    .eq("visibility", "departments")
    .eq("archived", false)
    .order("created_at")
    .order("id");
  return (data ?? []) as DeptSheetInfo[];
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

/**
 * An editable dashboard Sheet as plain rows, for pages that read a tab the team now edits in the
 * dashboard (Collections reads "Client VA Payments"). The column names are given twice as two header
 * rows, the way the Google Sheet had a title row above the headers.
 */
export async function getSheetRows(sheetId: string): Promise<{ rows: MirrorRow[]; updatedAt: string } | null> {
  const supabase = await getServerSupabase();
  const [{ data: sheet }, { data: cols }] = await Promise.all([
    supabase.from("sheets").select("id, updated_at").eq("id", sheetId).maybeSingle(),
    supabase.from("sheet_columns").select("id, name, position").eq("sheet_id", sheetId).order("position"),
  ]);
  if (!sheet || !cols) return null;
  const list = await allRows<{ cells: Record<string, unknown>; position: number; updated_at: string }>((a, b) =>
    supabase.from("sheet_rows").select("cells, position, updated_at").eq("sheet_id", sheetId).order("position").order("id").range(a, b),
  );
  const head = cols.map((c) => ({ v: String(c.name), s: null, n: "" }));
  const text = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "boolean" ? (v ? "TRUE" : "") : String(v));
  const rows: MirrorRow[] = [
    { num: 1, hidden: false, cells: head },
    { num: 2, hidden: false, cells: head },
    ...list.map((r, i) => ({ num: i + 3, hidden: false, cells: cols.map((c) => ({ v: text(r.cells[c.id as string]), s: null, n: "" })) })),
  ];
  const updatedAt = list.reduce((m, r) => (r.updated_at > m ? r.updated_at : m), String(sheet.updated_at));
  return { rows, updatedAt };
}
