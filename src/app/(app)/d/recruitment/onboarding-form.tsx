import { FEE_LABEL, FEE_STATUSES, OB_LABEL, OB_STATUSES, type FeeStatus, type ObStatus } from "@/lib/ops-records";
import { SubmitButton } from "@/components/ui/submit-button";
import { field, labelCls } from "@/components/crm";
import { cn } from "@/lib/utils";
import { saveOnboarding } from "./actions";
import type { ClientOption } from "./data";

/** One closed sale → VA onboarding → hiring fee (onboardings). Shared by Onboarding and Hiring fees. */
export type Onboarding = {
  id: string;
  client_id: string;
  va_name: string | null;
  va_email: string | null;
  va_cv: string | null;
  role: string | null;
  employment_type: string | null;
  sales_type: string | null;
  closed_on: string | null;
  closed_by: string | null;
  manager_name: string | null;
  contacted_by_am: string | null;
  ob_status: ObStatus;
  ob_status_detail: string | null;
  ob_date: string | null;
  start_date: string | null;
  country: string | null;
  campaign_status: string | null;
  fee_status: FeeStatus;
  fee_status_detail: string | null;
  fee_invoice: string | null;
  fee_paid: string | null;
  notes: string | null;
  updated_at: string;
};

export function OnboardingForm({ clients, back, o }: { clients: ClientOption[]; back: string; o?: Onboarding }) {
  const text = (name: keyof Onboarding, label: string, span = "") => (
    <label className={cn(labelCls, span)}>
      {label}
      <input name={name} defaultValue={(o?.[name] as string | null) ?? ""} className={field} />
    </label>
  );
  const date = (name: keyof Onboarding, label: string) => (
    <label className={labelCls}>
      {label}
      <input type="date" name={name} defaultValue={(o?.[name] as string | null) ?? ""} className={field} />
    </label>
  );
  return (
    <form action={saveOnboarding} className="grid grid-cols-1 gap-3 px-4 pb-4 pt-1 sm:grid-cols-2 lg:grid-cols-4">
      {o && <input type="hidden" name="id" value={o.id} />}
      {o && <input type="hidden" name="updated_at" value={o.updated_at} />}
      <input type="hidden" name="back" value={back} />
      {!o && (
        <label className={cn(labelCls, "lg:col-span-2")}>
          Client *
          <select name="client_id" required defaultValue="" className={field}>
            <option value="" disabled>
              Choose a client
            </option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {text("va_name", "VA")}
      {text("role", "Role")}
      {text("va_email", "VA email")}
      {text("va_cv", "VA CV link")}
      {text("employment_type", "Full time / Part time")}
      {text("sales_type", "Sales type (New / Replacement)")}
      {date("closed_on", "Closed on")}
      {text("closed_by", "Closed by")}
      {text("manager_name", "VA manager")}
      {text("contacted_by_am", "Contacted by AM")}
      <label className={labelCls}>
        Onboarding
        <select name="ob_status" defaultValue={o?.ob_status ?? "to_schedule"} className={field}>
          {OB_STATUSES.map((st) => (
            <option key={st} value={st}>
              {OB_LABEL[st]}
            </option>
          ))}
        </select>
      </label>
      {text("ob_status_detail", "Onboarding note (MIA, waiting…)")}
      {date("ob_date", "OB date")}
      {date("start_date", "Start date")}
      {text("country", "Country")}
      {text("campaign_status", "Campaign status")}
      <label className={labelCls}>
        Hiring fee
        <select name="fee_status" defaultValue={o?.fee_status ?? "to_send"} className={field}>
          {FEE_STATUSES.map((st) => (
            <option key={st} value={st}>
              {FEE_LABEL[st]}
            </option>
          ))}
        </select>
      </label>
      {text("fee_invoice", "Fee invoice no.")}
      {text("fee_paid", "Fee paid")}
      {text("notes", "Notes", "sm:col-span-2 lg:col-span-3")}
      <div className="flex items-end">
        <SubmitButton size="sm" pendingText="Saving…">{o ? "Save changes" : "Add onboarding"}</SubmitButton>
      </div>
    </form>
  );
}
