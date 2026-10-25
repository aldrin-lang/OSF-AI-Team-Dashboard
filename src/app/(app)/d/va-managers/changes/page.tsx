import Link from "next/link";
import { requireArea } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { allRows } from "@/lib/server/paged";
import { CHANGE_LABEL, CHANGE_STATUSES, type ChangeStatus } from "@/lib/ops-records";
import { money } from "@/lib/client-payments";
import { PageHeader } from "@/components/page-header";
import { Flash, flashFrom } from "@/components/ops/flash";
import { EmptyState } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { field, labelCls, Pager, Pill, SearchBox, shortDate, StatusTabs, urlFor, type Tone } from "@/components/crm";
import { cn } from "@/lib/utils";
import { saveChange } from "../actions";
import { vaClientOptions, type ClientOption } from "../data";

export const metadata = { title: "Replacements & cancellations · VA Managers" };

const PAGE = 100;
const TONE: Record<ChangeStatus, Tone> = { in_progress: "amber", replaced: "green", cancelled: "red", withdrawn: "grey" };
type Change = {
  id: string;
  kind: "replacement" | "cancellation";
  client_id: string;
  va_name: string | null;
  va_role: string | null;
  manager_name: string | null;
  reason_tag: string | null;
  reason: string | null;
  rca: string | null;
  controllable: boolean | null;
  action_next: string | null;
  last_day: string | null;
  notified_on: string | null;
  started_on: string | null;
  initiated_by: string | null;
  assigned_to: string | null;
  status: ChangeStatus;
  status_detail: string | null;
  monthly_profit: number | null;
  notes: string | null;
  updated_at: string;
  clients: { name: string } | null;
};

/** VA Managers › Replacements & cancellations: each VA replacement or campaign cancellation, with the reason and RCA. */
export default async function ChangesPage(props: PageProps<"/d/va-managers/changes">) {
  await requireArea("clients");
  const sp = await props.searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).slice(0, 80) : "");
  const supabase = await getServerSupabase();
  const [all, clients] = await Promise.all([
    allRows<Change>((a, b) =>
      supabase.from("va_changes").select("*, clients(name)").order("last_day", { ascending: false, nullsFirst: false }).order("id").range(a, b),
    ),
    vaClientOptions(),
  ]);
  const kind = one("kind") === "replacement" || one("kind") === "cancellation" ? one("kind") : "";
  const q = one("q").toLowerCase();
  const scoped = all.filter((c) => !kind || c.kind === kind);
  const tab = ((CHANGE_STATUSES as readonly string[]).includes(one("tab")) ? one("tab") : "in_progress") as ChangeStatus;
  const rows = scoped
    .filter((c) => c.status === tab)
    .filter((c) => !q || [c.clients?.name, c.va_name, c.reason, c.reason_tag, c.rca].some((v) => (v ?? "").toLowerCase().includes(q)));
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const page = Math.min(Math.max(1, Number(one("page")) || 1), pages);
  const base = "/d/va-managers/changes";
  const params = { tab, kind, q: one("q"), page: page > 1 ? String(page) : "" };
  const back = urlFor(base, params);

  return (
    <div className="space-y-5">
      <PageHeader title="Replacements & cancellations" subtitle="Every VA replacement and campaign cancellation: why it happened (reason, RCA) and where it stands." />
      <Flash msg={flashFrom(sp)} />
      <StatusTabs
        base={base}
        params={params}
        active={tab}
        items={CHANGE_STATUSES.map((s) => ({ key: s, label: CHANGE_LABEL[s], count: scoped.filter((c) => c.status === s).length, tone: TONE[s] }))}
      />
      <div className="flex flex-wrap items-center gap-3">
        <SearchBox base={base} params={params} q={one("q")} placeholder="Client, VA, reason" />
        <div className="flex gap-1.5">
          {[
            ["", "Both"],
            ["replacement", "Replacements"],
            ["cancellation", "Cancellations"],
          ].map(([k, l]) => (
            <Link
              key={k || "both"}
              href={urlFor(base, params, { kind: k, page: "" })}
              className={cn("rounded-full border px-3 py-1 text-xs font-semibold", kind === k ? "border-brand-600 bg-brand-600 text-white" : "border-line text-ink-muted hover:bg-fill")}
            >
              {l}
            </Link>
          ))}
        </div>
        <span className="text-sm text-ink-faint">{rows.length} records</span>
      </div>

      <details className="rounded-2xl border border-line bg-surface">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-brand-600">+ Add a replacement or cancellation</summary>
        <ChangeForm clients={clients} back={back} />
      </details>

      {rows.length === 0 ? (
        <EmptyState>Nothing {CHANGE_LABEL[tab].toLowerCase()} here.</EmptyState>
      ) : (
        <ul className="space-y-2.5">
          {rows.slice((page - 1) * PAGE, page * PAGE).map((c) => (
            <li key={c.id} className="rounded-2xl border border-line bg-surface px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <Link href={`/clients/${c.client_id}`} className="font-semibold text-ink hover:text-brand-600 hover:underline">
                  {c.clients?.name ?? "Client"}
                </Link>
                {c.va_name && <span className="text-sm text-ink-muted">VA {c.va_name}{c.va_role ? ` · ${c.va_role}` : ""}</span>}
                <Pill tone={c.kind === "cancellation" ? "red" : "violet"}>{c.kind === "cancellation" ? "Cancellation" : "Replacement"}</Pill>
                <Pill tone={TONE[c.status]}>{c.status_detail && c.status === "in_progress" ? c.status_detail : CHANGE_LABEL[c.status]}</Pill>
                {c.reason_tag && <span className="text-xs font-semibold text-ink-muted">{c.reason_tag}</span>}
                <span className="ml-auto text-xs text-ink-faint">
                  {c.last_day ? `Last day ${shortDate(c.last_day)}` : c.notified_on ? `Notified ${shortDate(c.notified_on)}` : ""}
                  {c.manager_name ? ` · ${c.manager_name}` : ""}
                </span>
              </div>
              <p className="mt-1.5 text-sm text-ink">{c.reason || <span className="text-ink-faint">No reason written</span>}</p>
              {(c.rca || c.action_next || c.monthly_profit != null || c.controllable != null) && (
                <p className="mt-1 text-xs text-ink-muted">
                  {[
                    c.rca && `RCA: ${c.rca}`,
                    c.controllable != null && (c.controllable ? "Controllable" : "Not controllable"),
                    c.action_next && `Next: ${c.action_next}`,
                    c.monthly_profit != null && `${money(Number(c.monthly_profit))} monthly profit`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              )}
              {c.notes && <p className="mt-1 text-xs text-ink-faint">{c.notes}</p>}
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-medium text-ink-faint hover:text-ink">Edit / update status</summary>
                <ChangeForm clients={clients} back={back} c={c} />
              </details>
            </li>
          ))}
        </ul>
      )}
      <Pager base={base} params={params} page={page} pages={pages} />
    </div>
  );
}

function ChangeForm({ clients, back, c }: { clients: ClientOption[]; back: string; c?: Change }) {
  const yn = c?.controllable == null ? "" : c.controllable ? "yes" : "no";
  return (
    <form action={saveChange} className="grid grid-cols-1 gap-3 px-4 pb-4 pt-1 sm:grid-cols-2 lg:grid-cols-4">
      {c && <input type="hidden" name="id" value={c.id} />}
      {c && <input type="hidden" name="updated_at" value={c.updated_at} />}
      <input type="hidden" name="back" value={back} />
      <label className={labelCls}>
        Type
        <select name="kind" defaultValue={c?.kind ?? "replacement"} className={field}>
          <option value="replacement">Replacement</option>
          <option value="cancellation">Cancellation</option>
        </select>
      </label>
      {c ? (
        <input type="hidden" name="client_id" value={c.client_id} />
      ) : (
        <label className={cn(labelCls, "lg:col-span-2")}>
          Client *
          <select name="client_id" required defaultValue="" className={field}>
            <option value="" disabled>
              Choose a client
            </option>
            {clients.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className={labelCls}>
        Status
        <select name="status" defaultValue={c?.status ?? "in_progress"} className={field}>
          {CHANGE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {CHANGE_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      <label className={labelCls}>
        VA
        <input name="va_name" defaultValue={c?.va_name ?? ""} className={field} />
      </label>
      <label className={labelCls}>
        VA role
        <input name="va_role" defaultValue={c?.va_role ?? ""} className={field} />
      </label>
      <label className={labelCls}>
        Reason tag
        <input name="reason_tag" list="reason-tags" defaultValue={c?.reason_tag ?? ""} placeholder="VA Resigned, Client Funds…" className={field} />
        <datalist id="reason-tags">
          {["VA Resigned", "Client Funds", "VA Performance", "VA AWOL", "VA Experience"].map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
      </label>
      <label className={labelCls}>
        Where it stands
        <input name="status_detail" defaultValue={c?.status_detail ?? ""} placeholder="CV Pooling, Interview Scheduled…" className={field} />
      </label>
      <label className={cn(labelCls, "sm:col-span-2")}>
        Reason
        <input name="reason" defaultValue={c?.reason ?? ""} className={field} />
      </label>
      <label className={cn(labelCls, "sm:col-span-2")}>
        RCA (root cause)
        <input name="rca" defaultValue={c?.rca ?? ""} className={field} />
      </label>
      <label className={labelCls}>
        Controllable?
        <select name="controllable" defaultValue={yn} className={field}>
          <option value="">Not set</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </label>
      <label className={cn(labelCls, "sm:col-span-2 lg:col-span-3")}>
        Action going forward
        <input name="action_next" defaultValue={c?.action_next ?? ""} className={field} />
      </label>
      <label className={labelCls}>
        VA&apos;s last day
        <input type="date" name="last_day" defaultValue={c?.last_day ?? ""} className={field} />
      </label>
      <label className={labelCls}>
        Notified on
        <input type="date" name="notified_on" defaultValue={c?.notified_on ?? ""} className={field} />
      </label>
      <label className={labelCls}>
        Manager
        <input name="manager_name" defaultValue={c?.manager_name ?? ""} className={field} />
      </label>
      <label className={labelCls}>
        Monthly profit
        <input name="monthly_profit" inputMode="decimal" defaultValue={c?.monthly_profit ?? ""} className={field} />
      </label>
      <label className={labelCls}>
        Initiated by
        <input name="initiated_by" defaultValue={c?.initiated_by ?? ""} className={field} />
      </label>
      <label className={labelCls}>
        Assigned to
        <input name="assigned_to" defaultValue={c?.assigned_to ?? ""} className={field} />
      </label>
      <label className={cn(labelCls, "sm:col-span-2")}>
        Notes
        <input name="notes" defaultValue={c?.notes ?? ""} className={field} />
      </label>
      <div className="flex items-end">
        <SubmitButton size="sm" pendingText="Saving…">{c ? "Save changes" : "Add"}</SubmitButton>
      </div>
    </form>
  );
}
