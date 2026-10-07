"use server";

import { revalidatePath } from "next/cache";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireActorArea } from "@/lib/server/rbac";
import { PLACEMENT_STATUS } from "@/lib/labels";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CURRENCIES = ["GBP", "EUR", "NZD", "AUD", "CAD", "USD", "PHP"];

/** Edit a placement's working details from the VA roster. */
export async function savePlacementDetails(formData: FormData) {
  await requireActorArea("clients");
  const get = (k: string) => String(formData.get(k) ?? "").trim();
  const id = get("id");
  if (!UUID.test(id)) return;
  const date = (k: string) => (/^\d{4}-\d{2}-\d{2}$/.test(get(k)) ? get(k) : null);
  const rate = Number(get("hourly_rate"));
  const hours = Number(get("hours_per_week"));
  const status = get("placement_status");
  const supabase = await getServerSupabase();
  await supabase
    .from("va_placements")
    .update({
      start_date: date("start_date"),
      end_date: date("end_date"),
      hourly_rate: get("hourly_rate") && Number.isFinite(rate) && rate >= 0 ? rate : null,
      rate_currency: CURRENCIES.includes(get("rate_currency")) ? get("rate_currency") : "USD",
      hours_per_week: Number.isInteger(hours) && hours >= 1 && hours <= 80 ? hours : null,
      notes: get("notes").slice(0, 2000) || null,
      ...(status in PLACEMENT_STATUS ? { placement_status: status } : {}),
    })
    .eq("id", id);
  revalidatePath("/vas");
}
