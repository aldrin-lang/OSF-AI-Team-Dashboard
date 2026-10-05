"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActorRole } from "@/lib/server/rbac";
import { runDailyReport } from "@/lib/server/daily-report";
import { dublinDate, isIsoDate } from "@/lib/ops-core";

export async function generateReport(formData: FormData) {
  await requireActorRole("manager");
  const d = String(formData.get("date") ?? "");
  const date = isIsoDate(d) && d <= dublinDate() ? d : dublinDate();
  const email = formData.get("email") === "1";
  const r = await runDailyReport(date, { email });
  revalidatePath("/reports/daily");
  const msg = !r.ok
    ? `Could not build the report: ${r.error}`
    : [
        "Report updated",
        email ? (r.emailed ? `emailed to ${r.emailed}` : "not emailed (already sent for this day, or email is off)") : null,
        r.error ? `AI summary failed (${r.error}), showing the plain facts` : null,
      ]
        .filter(Boolean)
        .join(" · ");
  redirect(`/reports/daily?date=${date}&msg=${encodeURIComponent(msg)}`);
}
