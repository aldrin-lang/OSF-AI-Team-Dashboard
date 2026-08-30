"use server";

import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireActor } from "@/lib/server/rbac";
import { logActivity } from "@/lib/server/activity";
import { moveClientStage } from "./actions";

const TEXT = new Set([
  "company_name",
  "name",
  "contact_email",
  "country",
  "source",
  "closed_by",
  "portal_url",
  "remarks",
]);
const SELECT = new Set(["manager_id", "status", "hiring_fee_status"]);
const NUM = new Set(["setup_fee", "daily_rate"]);
const DATE = new Set(["demo_call_date", "start_date"]);
const COMMERCIAL = new Set(["setup_fee", "daily_rate", "hiring_fee_status"]);

const LABELS: Record<string, string> = {
  company_name: "Company",
  name: "Contact",
  contact_email: "Contact email",
  country: "Country",
  source: "Source",
  closed_by: "Closed by",
  portal_url: "Portal link",
  remarks: "Remarks",
  manager_id: "Manager",
  status: "Status",
  hiring_fee_status: "Hiring fee",
  setup_fee: "Setup fee",
  daily_rate: "Daily rate",
  demo_call_date: "Demo call",
  start_date: "Start date",
};

/** Edit one field of one client from the grid. Stage changes go through the gate check. */
export async function setClientField(input: {
  id: string;
  field: string;
  value: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const actor = await requireActor();

  if (input.field === "stage_id") {
    if (!input.value) return { ok: false, error: "Pick a stage" };
    return moveClientStage({ clientId: input.id, toStageId: input.value });
  }

  const f = input.field;
  const valid = TEXT.has(f) || SELECT.has(f) || NUM.has(f) || DATE.has(f);
  if (!valid) return { ok: false, error: "That field can't be edited here" };
  if (COMMERCIAL.has(f) && actor.role === "member") {
    return { ok: false, error: "Only managers or admins can edit fees" };
  }

  const raw = input.value?.trim() ?? "";
  let value: string | number | null = raw === "" ? null : raw;
  if (NUM.has(f)) {
    const n = Number(raw);
    value = raw === "" || !Number.isFinite(n) ? null : n;
  }
  if (f === "hiring_fee_status" && value === null) value = "pending";

  const supabase = await getServerSupabase();
  const { error } = await supabase.from("clients").update({ [f]: value }).eq("id", input.id);
  if (error) return { ok: false, error: error.message };

  await logActivity({
    entity: "client",
    entityId: input.id,
    verb: "updated",
    summary: `${LABELS[f] ?? f} set`,
  });

  revalidatePath("/");
  revalidatePath("/clients");
  revalidatePath(`/clients/${input.id}`);
  return { ok: true };
}
