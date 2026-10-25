import { requireArea } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { OB_LABEL, OB_STATUSES, FEE_LABEL, type ObStatus } from "@/lib/ops-records";
import { PageHeader } from "@/components/page-header";
import { Flash, flashFrom } from "@/components/ops/flash";
import { EmptyState } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { fieldSm, likeTerm, Pager, Pill, SearchBox, shortDate, StatusTabs, urlFor, type Tone } from "@/components/crm";
import { setObStatus } from "../actions";
import { clientDirectory } from "../data";
import { OnboardingForm, type Onboarding } from "../onboarding-form";

export const metadata = { title: "Onboarding · Recruitment" };

const PAGE = 50;
const TONE: Record<ObStatus, Tone> = { to_schedule: "amber", scheduled: "blue", done: "green", withdrawn: "grey" };

/** Recruitment › Onboarding: every closed sale and its VA onboarding (to schedule → scheduled → done). */
export default async function OnboardingPage(props: PageProps<"/d/recruitment/onboarding">) {
  await requireArea("candidates");
  const sp = await props.searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).slice(0, 80) : "");
  const supabase = await getServerSupabase();
  const tab = ((OB_STATUSES as readonly string[]).includes(one("tab")) ? one("tab") : "to_schedule") as ObStatus;
  const q = one("q").replace(/[,()]/g, " ").trim();
  const askedPage = Math.max(1, Number(one("page")) || 1);

  const dir = await clientDirectory();
  let list = supabase.from("onboardings").select("*", { count: "exact" }).eq("ob_status", tab);
  if (q) {
    const ids = [...dir.names].filter(([, n]) => n.toLowerCase().includes(q.toLowerCase())).map(([id]) => id).slice(0, 150);
    list = list.or([`va_name.ilike.${likeTerm(q)}`, `role.ilike.${likeTerm(q)}`, ...(ids.length ? [`client_id.in.(${ids.join(",")})`] : [])].join(","));
  }
  const counts = OB_STATUSES.map((st) => supabase.from("onboardings").select("id", { count: "exact", head: true }).eq("ob_status", st));
  const [{ data, count, error }, ...tabCounts] = await Promise.all([
    list.order("closed_on", { ascending: false, nullsFirst: false }).order("id").range((askedPage - 1) * PAGE, askedPage * PAGE - 1),
    ...counts,
  ]);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Onboarding[];
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const base = "/d/recruitment/onboarding";
  const params = { tab, q, page: askedPage > 1 ? String(askedPage) : "" };
  const back = urlFor(base, params);

  return (
    <div className="space-y-5">
      <PageHeader title="Onboarding" subtitle="Every closed sale and its VA onboarding: who, when, and whether it's done." />
      <Flash msg={flashFrom(sp)} />
      <StatusTabs
        base={base}
        params={params}
        active={tab}
        items={OB_STATUSES.map((st, i) => ({ key: st, label: OB_LABEL[st], count: tabCounts[i].count ?? 0, tone: TONE[st] }))}
      />
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox base={base} params={params} q={q} placeholder="Client, VA or role" />
        <span className="text-sm text-ink-faint">{count ?? 0} onboardings</span>
      </div>

      <details className="rounded-2xl border border-line bg-surface">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-brand-600">+ Add a closed sale / onboarding</summary>
        <OnboardingForm clients={dir.options} back={back} />
      </details>

      {rows.length === 0 ? (
        <EmptyState>No onboardings in {OB_LABEL[tab]}.</EmptyState>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((o) => (
            <li key={o.id} className="rounded-2xl border border-line bg-surface px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-semibold text-ink">{dir.names.get(o.client_id) ?? "Client"}</span>
                {o.va_name && <span className="text-sm text-ink">VA {o.va_name}</span>}
                {o.role && <span className="text-sm text-ink-muted">{o.role}</span>}
                <Pill tone={TONE[o.ob_status]}>{o.ob_status_detail || OB_LABEL[o.ob_status]}</Pill>
                <span className="text-xs text-ink-muted">Fee: {o.fee_status_detail || FEE_LABEL[o.fee_status]}</span>
                <form action={setObStatus} className="ml-auto flex items-center gap-1.5">
                  <input type="hidden" name="id" value={o.id} />
                  <input type="hidden" name="updated_at" value={o.updated_at} />
                  <input type="hidden" name="back" value={back} />
                  <input type="date" name="ob_date" defaultValue={o.ob_date ?? ""} aria-label="OB date" className={fieldSm} />
                  <select name="ob_status" defaultValue={o.ob_status} aria-label="Onboarding status" className={fieldSm}>
                    {OB_STATUSES.map((st) => (
                      <option key={st} value={st}>
                        {OB_LABEL[st]}
                      </option>
                    ))}
                  </select>
                  <SubmitButton size="sm" variant="secondary" pendingText="…">Save</SubmitButton>
                </form>
              </div>
              <p className="mt-1 text-xs text-ink-faint">
                {[
                  o.closed_on && `Closed ${shortDate(o.closed_on)}`,
                  o.closed_by && `by ${o.closed_by}`,
                  o.sales_type,
                  o.employment_type,
                  o.ob_date && `OB ${shortDate(o.ob_date)}`,
                  o.start_date && `Starts ${shortDate(o.start_date)}`,
                  o.manager_name && `Manager ${o.manager_name}`,
                  o.country,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              {o.notes && <p className="mt-1 text-xs text-ink-muted">{o.notes}</p>}
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-medium text-ink-faint hover:text-ink">Edit</summary>
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
