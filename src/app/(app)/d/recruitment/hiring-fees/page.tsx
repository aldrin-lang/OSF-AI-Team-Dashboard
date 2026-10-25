import { requireArea } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { FEE_LABEL, FEE_STATUSES, OB_LABEL, type FeeStatus } from "@/lib/ops-records";
import { PageHeader } from "@/components/page-header";
import { Flash, flashFrom } from "@/components/ops/flash";
import { EmptyState } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { fieldSm, likeTerm, Pager, Pill, SearchBox, shortDate, StatusTabs, urlFor, type Tone } from "@/components/crm";
import { cn } from "@/lib/utils";
import { setFee } from "../actions";
import { clientDirectory } from "../data";
import { OnboardingForm, type Onboarding } from "../onboarding-form";

export const metadata = { title: "Hiring fees · Recruitment" };

const PAGE = 50;
const TONE: Record<FeeStatus, Tone> = { to_send: "amber", charged: "blue", paid: "green", na: "grey" };

/** Recruitment › Hiring fees: the fee for each closed sale (to send → charged → paid). */
export default async function HiringFeesPage(props: PageProps<"/d/recruitment/hiring-fees">) {
  await requireArea("candidates");
  const sp = await props.searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).slice(0, 80) : "");
  const supabase = await getServerSupabase();
  const tab = ((FEE_STATUSES as readonly string[]).includes(one("tab")) ? one("tab") : "to_send") as FeeStatus;
  const q = one("q").replace(/[,()]/g, " ").trim();
  const askedPage = Math.max(1, Number(one("page")) || 1);

  const dir = await clientDirectory();
  let list = supabase.from("onboardings").select("*", { count: "exact" }).eq("fee_status", tab);
  if (q) {
    const ids = [...dir.names].filter(([, n]) => n.toLowerCase().includes(q.toLowerCase())).map(([id]) => id).slice(0, 150);
    list = list.or([`va_name.ilike.${likeTerm(q)}`, `fee_invoice.ilike.${likeTerm(q)}`, ...(ids.length ? [`client_id.in.(${ids.join(",")})`] : [])].join(","));
  }
  const counts = FEE_STATUSES.map((st) => supabase.from("onboardings").select("id", { count: "exact", head: true }).eq("fee_status", st));
  const [{ data, count, error }, ...tabCounts] = await Promise.all([
    list.order("closed_on", { ascending: false, nullsFirst: false }).order("id").range((askedPage - 1) * PAGE, askedPage * PAGE - 1),
    ...counts,
  ]);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Onboarding[];
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const base = "/d/recruitment/hiring-fees";
  const params = { tab, q, page: askedPage > 1 ? String(askedPage) : "" };
  const back = urlFor(base, params);

  return (
    <div className="space-y-5">
      <PageHeader title="Hiring fees" subtitle="The hiring fee for each closed sale: still to send, charged, or paid." />
      <Flash msg={flashFrom(sp)} />
      <StatusTabs
        base={base}
        params={params}
        active={tab}
        items={FEE_STATUSES.map((st, i) => ({ key: st, label: FEE_LABEL[st], count: tabCounts[i].count ?? 0, tone: TONE[st] }))}
      />
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox base={base} params={params} q={q} placeholder="Client, VA or invoice no." />
        <span className="text-sm text-ink-faint">{count ?? 0} closed sales</span>
      </div>

      {rows.length === 0 ? (
        <EmptyState>No hiring fees in {FEE_LABEL[tab]}.</EmptyState>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((o) => (
            <li key={o.id} className="rounded-2xl border border-line bg-surface px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-semibold text-ink">{dir.names.get(o.client_id) ?? "Client"}</span>
                {o.va_name && <span className="text-sm text-ink">VA {o.va_name}</span>}
                <Pill tone={TONE[o.fee_status]}>{o.fee_status_detail || FEE_LABEL[o.fee_status]}</Pill>
                <span className="text-xs text-ink-faint">
                  {[o.closed_on && `Closed ${shortDate(o.closed_on)}`, o.sales_type, `Onboarding ${OB_LABEL[o.ob_status].toLowerCase()}`].filter(Boolean).join(" · ")}
                </span>
              </div>
              <form action={setFee} className="mt-2 flex flex-wrap items-center gap-1.5">
                <input type="hidden" name="id" value={o.id} />
                <input type="hidden" name="updated_at" value={o.updated_at} />
                <input type="hidden" name="back" value={back} />
                <select name="fee_status" defaultValue={o.fee_status} aria-label="Fee status" className={fieldSm}>
                  {FEE_STATUSES.map((st) => (
                    <option key={st} value={st}>
                      {FEE_LABEL[st]}
                    </option>
                  ))}
                </select>
                <input name="fee_invoice" defaultValue={o.fee_invoice ?? ""} placeholder="Invoice no." aria-label="Invoice number" className={cn(fieldSm, "w-36")} />
                <input name="fee_paid" defaultValue={o.fee_paid ?? ""} placeholder="Paid (amount / date)" aria-label="Fee paid" className={cn(fieldSm, "w-48")} />
                <SubmitButton size="sm" variant="secondary" pendingText="…">Save</SubmitButton>
              </form>
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-medium text-ink-faint hover:text-ink">Edit the whole record</summary>
                <OnboardingForm clients={dir.options} back={back} o={o} />
              </details>
            </li>
          ))}
        </ul>
      )}
      <Pager base={base} params={params} page={Math.min(askedPage, pages)} pages={pages} />
    </div>
  );
}
