import "server-only";
import { getServerSupabase } from "@/lib/supabase/server";
import { dublinDate } from "@/lib/ops-core";
import { SHEET_TEMPLATES, type CellValue, type SheetVisibility } from "@/lib/sheets";

/** Create a sheet from a template (columns + a starter row). Used by the page and by Sourci. */
export async function createSheetFrom(
  templateKey: string,
  name: string,
  meId: string,
  share: { visibility?: SheetVisibility; departments?: string[] } = {},
): Promise<string> {
  const tpl = SHEET_TEMPLATES.find((t) => t.key === templateKey) ?? SHEET_TEMPLATES[SHEET_TEMPLATES.length - 1];
  const supabase = await getServerSupabase();
  const { data: sheet, error } = await supabase
    .from("sheets")
    .insert({
      name: (name || tpl.name).slice(0, 120),
      emoji: tpl.emoji,
      description: tpl.key === "blank" ? null : tpl.blurb,
      visibility: share.visibility ?? "private",
      departments: share.departments ?? [],
      created_by: meId,
    })
    .select("id")
    .single();
  if (error || !sheet) throw new Error(error?.message ?? "Couldn't create the sheet");

  const { data: cols } = await supabase
    .from("sheet_columns")
    .insert(
      tpl.columns.map((c, i) => ({
        sheet_id: sheet.id,
        name: c.name,
        type: c.type,
        options: c.options ?? {},
        width: c.width ?? 180,
        position: i,
      })),
    )
    .select("id, name");

  const byName = new Map((cols ?? []).map((c) => [c.name as string, c.id as string]));
  const samples = tpl.sample?.length ? tpl.sample : [{}, {}, {}];
  const rows = samples.map((s, i) => {
    const cells: Record<string, CellValue> = {};
    for (const [k, v] of Object.entries(s)) {
      const id = byName.get(k);
      if (!id) continue;
      cells[id] = v === "@me" ? meId : v === "@today" ? dublinDate() : v;
    }
    return { sheet_id: sheet.id, position: i + 1, cells, created_by: meId };
  });
  // a few empty rows so it feels like a sheet straight away
  while (rows.length < 5) rows.push({ sheet_id: sheet.id, position: rows.length + 1, cells: {}, created_by: meId });
  await supabase.from("sheet_rows").insert(rows);
  return sheet.id as string;
}

