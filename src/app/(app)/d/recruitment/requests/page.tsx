import { requireArea } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { ROLE_STAGE_LABEL, ROLE_STAGES, type RoleStage } from "@/lib/ops-records";
import { PageHeader } from "@/components/page-header";
import { Flash, flashFrom } from "@/components/ops/flash";
import { EmptyState } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { field, fieldSm, labelCls, likeTerm, Pager, Pill, SearchBox, shortDate, StatusTabs, urlFor, type Tone } from "@/components/crm";
import { cn } from "@/lib/utils";
import { addEndorsed, removeEndorsed, saveRequest, setRequestStage } from "../actions";
import { clientDirectory, type ClientOption } from "../data";

export const metadata = { title: "Client requests · Recruitment" };

const PAGE = 40;
const TONE: Record<RoleStage, Tone> = {
  cv_pooling: "amber",
  ready: "blue",
  endorsed: "blue",
  interview: "violet",
  pending_decision: "violet",
  paused: "grey",
  live: "green",
  withdrawn: "red",
};
type Endorsed = { name: string; email?: string; cv?: string; portfolio?: string };
type Req = {
  id: string;
  client_id: string;
  title: string;
  stage: RoleStage | null;
  stage_detail: string | null;
  requested_on: string | null;
  closed_on: string | null;
  manager_name: string | null;
  sdr: string | null;
  hire_type: string | null;
  country: string | null;
  va_type: string | null;
  industry: string | null;
  work_arrangement: string | null;
  interview_schedule: string | null;
  reengagement_status: string | null;
  rework_reason: string | null;
  hiring_notes: string | null;
  requirements: string | null;
  notes: string | null;
  endorsed: Endorsed[];
  updated_at: string;
};

/**
 * Recruitment › Client requests: every VA request from a client, by stage
 * (CV pooling → ready → endorsed → interview → pending decision → VA live, or paused / withdrawn).
 */
export default async function RequestsPage(props: PageProps<"/d/recruitment/requests">) {
  await requireArea("candidates");
  const sp = await props.searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).slice(0, 80) : "");
  const supabase = await getServerSupabase();
  const tab = ((ROLE_STAGES as readonly string[]).includes(one("tab")) ? one("tab") : "cv_pooling") as RoleStage;
  const q = one("q").replace(/[,()]/g, " ").trim();
  const askedPage = Math.max(1, Number(one("page")) || 1);

  const dir = await clientDirectory();
  let list = supabase.from("va_roles").select("*", { count: "exact" }).eq("stage", tab);
  if (q) {
    const ids = [...dir.names].filter(([, n]) => n.toLowerCase().includes(q.toLowerCase())).map(([id]) => id).slice(0, 150);
    list = list.or([`title.ilike.${likeTerm(q)}`, `manager_name.ilike.${likeTerm(q)}`, ...(ids.length ? [`client_id.in.(${ids.join(",")})`] : [])].join(","));
  }
  const counts = ROLE_STAGES.map((st) => supabase.from("va_roles").select("id", { count: "exact", head: true }).eq("stage", st));
  const [{ data, count, error }, ...stageCounts] = await Promise.all([
    list.order("requested_on", { ascending: false, nullsFirst: false }).order("id").range((askedPage - 1) * PAGE, askedPage * PAGE - 1),
    ...counts,
  ]);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Req[];
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const base = "/d/recruitment/requests";
  const params = { tab, q, page: askedPage > 1 ? String(askedPage) : "" };
  const back = urlFor(base, params);

  return (
    <div className="space-y-5">
      <PageHeader title="Client requests" subtitle="Every VA request from a client and where it stands, from CV pooling to VA live." />
      <Flash msg={flashFrom(sp)} />
      <StatusTabs
        base={base}
        params={params}
        active={tab}
        items={ROLE_STAGES.map((st, i) => ({ key: st, label: ROLE_STAGE_LABEL[st], count: stageCounts[i].count ?? 0, tone: TONE[st] }))}
      />
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox base={base} params={params} q={q} placeholder="Client, VA title or manager" />
        <span className="text-sm text-ink-faint">{count ?? 0} requests</span>
      </div>

      <details className="rounded-2xl border border-line bg-surface">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-brand-600">+ Add a client request</summary>
        <RequestForm clients={dir.options} back={back} />
      </details>

      {rows.length === 0 ? (
        <EmptyState>No requests in {ROLE_STAGE_LABEL[tab]}.</EmptyState>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((r) => {
            const endorsed = Array.isArray(r.endorsed) ? r.endorsed : [];
            return (
              <li key={r.id} className="rounded-2xl border border-line bg-surface px-4 py-3">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span className="font-semibold text-ink">{dir.names.get(r.client_id) ?? "Client"}</span>
                  <span className="text-sm text-ink">{r.title}</span>
                  {r.stage && <Pill tone={TONE[r.stage]}>{r.stage_detail || ROLE_STAGE_LABEL[r.stage]}</Pill>}
                  {r.hire_type && <span className="text-xs text-ink-muted">{r.hire_type}</span>}
                  <form action={setRequestStage} className="ml-auto flex items-center gap-1.5">
                    <input type="hidden" name="id" value={r.id} />
                    <input type="hidden" name="updated_at" value={r.updated_at} />
                    <input type="hidden" name="back" value={back} />
                    <select name="stage" defaultValue={r.stage ?? "cv_pooling"} aria-label="Stage" className={fieldSm}>
                      {ROLE_STAGES.map((st) => (
                        <option key={st} value={st}>
                          {ROLE_STAGE_LABEL[st]}
                        </option>
                      ))}
                    </select>
                    <SubmitButton size="sm" variant="secondary" pendingText="…">Move</SubmitButton>
                  </form>
                </div>
                <p className="mt-1 text-xs text-ink-faint">
                  {[
                    r.requested_on && `Requested ${shortDate(r.requested_on)}`,
                    r.closed_on && `Closed ${shortDate(r.closed_on)}`,
                    r.manager_name && `Manager ${r.manager_name}`,
                    r.sdr && `SDR ${r.sdr}`,
                    r.country,
                    r.work_arrangement,
                    r.interview_schedule && `Interview: ${r.interview_schedule}`,
                    `${endorsed.length} candidate${endorsed.length === 1 ? "" : "s"} endorsed`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs font-medium text-ink-faint hover:text-ink">Details, candidates & edit</summary>
                  <div className="mt-2 space-y-3">
                    {(r.requirements || r.hiring_notes || r.rework_reason || r.notes) && (
                      <dl className="grid gap-2 text-sm sm:grid-cols-2">
                        {[
                          ["Responsibilities", r.requirements],
                          ["Hiring notes", r.hiring_notes],
                          ["Rework reason", r.rework_reason],
                          ["Notes", r.notes],
                        ]
                          .filter(([, v]) => v)
                          .map(([k, v]) => (
                            <div key={k as string}>
                              <dt className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{k}</dt>
                              <dd className="mt-0.5 whitespace-pre-wrap text-ink">{v}</dd>
                            </div>
                          ))}
                      </dl>
                    )}
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">Endorsed candidates</p>
                      {endorsed.length ? (
                        <ul className="mt-1 divide-y divide-line rounded-xl border border-line">
                          {endorsed.map((c, i) => (
                            <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-1.5 text-sm">
                              <span className="font-medium text-ink">{c.name}</span>
                              {c.email && <span className="text-ink-muted">{c.email}</span>}
                              {c.cv && /^https?:\/\//.test(c.cv) && (
                                <a href={c.cv} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
                                  CV
                                </a>
                              )}
                              {c.portfolio && /^https?:\/\//.test(c.portfolio) && (
                                <a href={c.portfolio} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
                                  Portfolio
                                </a>
                              )}
                              <form action={removeEndorsed} className="ml-auto">
                                <input type="hidden" name="id" value={r.id} />
                                <input type="hidden" name="updated_at" value={r.updated_at} />
                                <input type="hidden" name="index" value={i} />
                                <input type="hidden" name="back" value={back} />
                                <button className="text-xs text-ink-faint hover:text-red-600">Remove</button>
                              </form>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1 text-sm text-ink-faint">None yet.</p>
                      )}
                      <form action={addEndorsed} className="mt-2 flex flex-wrap items-center gap-1.5">
                        <input type="hidden" name="id" value={r.id} />
                        <input type="hidden" name="updated_at" value={r.updated_at} />
                        <input type="hidden" name="back" value={back} />
                        <input name="name" placeholder="Candidate name" aria-label="Candidate name" className={cn(fieldSm, "w-44")} required />
                        <input name="email" placeholder="Email" aria-label="Email" className={cn(fieldSm, "w-48")} />
                        <input name="cv" placeholder="CV link" aria-label="CV link" className={cn(fieldSm, "w-48")} />
                        <input name="portfolio" placeholder="Portfolio link" aria-label="Portfolio link" className={cn(fieldSm, "w-44")} />
                        <SubmitButton size="sm" variant="secondary" pendingText="…">Add candidate</SubmitButton>
                      </form>
                    </div>
                    <details>
                      <summary className="cursor-pointer text-xs font-medium text-ink-faint hover:text-ink">Edit request</summary>
                      <RequestForm clients={dir.options} back={back} r={r} />
                    </details>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
      <Pager base={base} params={params} page={Math.min(askedPage, pages)} pages={pages} />
    </div>
  );
}

function RequestForm({ clients, back, r }: { clients: ClientOption[]; back: string; r?: Req }) {
  const text = (name: keyof Req, label: string, span = "") => (
    <label className={cn(labelCls, span)}>
      {label}
      <input name={name} defaultValue={(r?.[name] as string | null) ?? ""} className={field} />
    </label>
  );
  return (
    <form action={saveRequest} className="grid grid-cols-1 gap-3 px-4 pb-4 pt-1 sm:grid-cols-2 lg:grid-cols-4">
      {r && <input type="hidden" name="id" value={r.id} />}
      {r && <input type="hidden" name="updated_at" value={r.updated_at} />}
      <input type="hidden" name="back" value={back} />
      {!r && (
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
      <label className={labelCls}>
        VA title *
        <input name="title" required defaultValue={r?.title ?? ""} className={field} />
      </label>
      <label className={labelCls}>
        Stage
        <select name="stage" defaultValue={r?.stage ?? "cv_pooling"} className={field}>
          {ROLE_STAGES.map((st) => (
            <option key={st} value={st}>
              {ROLE_STAGE_LABEL[st]}
            </option>
          ))}
        </select>
      </label>
      <label className={labelCls}>
        Requested on
        <input type="date" name="requested_on" defaultValue={r?.requested_on ?? ""} className={field} />
      </label>
      <label className={labelCls}>
        Closed on
        <input type="date" name="closed_on" defaultValue={r?.closed_on ?? ""} className={field} />
      </label>
      {text("manager_name", "VA manager")}
      {text("sdr", "SDR")}
      {text("hire_type", "Hire type (New / Replacement)")}
      {text("country", "Country")}
      {text("va_type", "VA type needed")}
      {text("industry", "Industry")}
      {text("work_arrangement", "Work arrangement")}
      {text("interview_schedule", "Interview schedule")}
      {text("reengagement_status", "Re-engagement status")}
      {text("rework_reason", "Rework reason", "sm:col-span-2")}
      {text("hiring_notes", "Hiring notes", "sm:col-span-2")}
      <label className={cn(labelCls, "sm:col-span-2 lg:col-span-4")}>
        Responsibilities
        <textarea name="requirements" rows={3} defaultValue={r?.requirements ?? ""} className={cn(field, "h-auto py-2")} />
      </label>
      {text("notes", "Notes", "sm:col-span-2 lg:col-span-3")}
      <div className="flex items-end">
        <SubmitButton size="sm" pendingText="Saving…">{r ? "Save changes" : "Add request"}</SubmitButton>
      </div>
    </form>
  );
}
