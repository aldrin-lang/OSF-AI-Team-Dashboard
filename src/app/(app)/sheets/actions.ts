"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireActor } from "@/lib/server/rbac";
import { createSheetFrom } from "@/lib/server/sheets";
import { SHEET_VISIBILITY, type CellValue, type SheetVisibility } from "@/lib/sheets";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function str(fd: FormData, k: string, max = 200): string {
  return String(fd.get(k) ?? "").trim().slice(0, max);
}

export async function createSheet(formData: FormData) {
  const me = await requireActor();
  const id = await createSheetFrom(str(formData, "template", 40), str(formData, "name", 120), me.id);
  revalidatePath("/sheets");
  redirect(`/sheets/${id}`);
}

export async function shareSheet(formData: FormData) {
  await requireActor();
  const id = str(formData, "id", 40);
  if (!UUID.test(id)) return;
  const raw = str(formData, "visibility", 20);
  const visibility = (SHEET_VISIBILITY as readonly string[]).includes(raw) ? (raw as SheetVisibility) : "private";
  const departments = formData.getAll("departments").map(String).filter((d) => /^[a-z_]{2,40}$/.test(d));
  const people = formData.getAll("people").map(String).filter((p) => UUID.test(p));
  const supabase = await getServerSupabase();
  const { error } = await supabase
    .from("sheets")
    .update({
      visibility,
      departments: visibility === "departments" ? departments : [],
      people: visibility === "people" ? people : [],
    })
    .eq("id", id);
  revalidatePath(`/sheets/${id}`);
  revalidatePath("/sheets");
  redirect(`/sheets/${id}?msg=${encodeURIComponent(error ? "Only the owner (or an admin) can change sharing." : "Sharing saved")}`);
}

export async function renameSheet(formData: FormData) {
  await requireActor();
  const id = str(formData, "id", 40);
  const name = str(formData, "name", 120);
  if (!UUID.test(id) || !name) return;
  const supabase = await getServerSupabase();
  await supabase.from("sheets").update({ name, description: str(formData, "description", 500) || null }).eq("id", id);
  revalidatePath(`/sheets/${id}`);
  revalidatePath("/sheets");
}

export async function setSheetArchived(formData: FormData) {
  await requireActor();
  const id = str(formData, "id", 40);
  if (!UUID.test(id)) return;
  const archived = formData.get("archived") === "true";
  const supabase = await getServerSupabase();
  await supabase.from("sheets").update({ archived }).eq("id", id);
  revalidatePath("/sheets");
  redirect(archived ? `/sheets?msg=${encodeURIComponent("Sheet archived")}` : `/sheets/${id}`);
}

export async function deleteSheet(formData: FormData) {
  await requireActor();
  const id = str(formData, "id", 40);
  if (!UUID.test(id) || formData.get("confirm") !== "DELETE") {
    redirect(`/sheets/${id}?msg=${encodeURIComponent("Type DELETE to confirm")}`);
  }
  const supabase = await getServerSupabase();
  const { count } = await supabase.from("sheets").delete({ count: "exact" }).eq("id", id);
  revalidatePath("/sheets");
  redirect(`/sheets?msg=${encodeURIComponent(count ? "Sheet deleted" : "Only the owner (or an admin) can delete it")}`);
}

export async function duplicateSheet(formData: FormData) {
  const me = await requireActor();
  const id = str(formData, "id", 40);
  if (!UUID.test(id)) return;
  const supabase = await getServerSupabase();
  const [{ data: src }, { data: cols }, { data: rows }] = await Promise.all([
    supabase.from("sheets").select("*").eq("id", id).single(),
    supabase.from("sheet_columns").select("*").eq("sheet_id", id).order("position"),
    supabase.from("sheet_rows").select("*").eq("sheet_id", id).order("position").limit(5000),
  ]);
  if (!src) return;
  const { data: copy } = await supabase
    .from("sheets")
    .insert({ name: `${src.name} (copy)`.slice(0, 120), emoji: src.emoji, description: src.description, created_by: me.id })
    .select("id")
    .single();
  if (!copy) return;
  const map = new Map<string, string>();
  if (cols?.length) {
    const { data: newCols } = await supabase
      .from("sheet_columns")
      .insert(cols.map((c) => ({ sheet_id: copy.id, name: c.name, type: c.type, options: c.options, width: c.width, position: c.position })))
      .select("id, position");
    for (const c of cols) {
      const n = newCols?.find((x) => x.position === c.position);
      if (n) map.set(c.id, n.id);
    }
  }
  if (rows?.length) {
    await supabase.from("sheet_rows").insert(
      rows.map((r) => ({
        sheet_id: copy.id,
        position: r.position,
        created_by: me.id,
        cells: Object.fromEntries(
          Object.entries((r.cells ?? {}) as Record<string, CellValue>)
            .filter(([k]) => map.has(k))
            .map(([k, v]) => [map.get(k)!, v]),
        ),
      })),
    );
  }
  revalidatePath("/sheets");
  redirect(`/sheets/${copy.id}?msg=${encodeURIComponent("Copy made. It's private to you until you share it.")}`);
}
