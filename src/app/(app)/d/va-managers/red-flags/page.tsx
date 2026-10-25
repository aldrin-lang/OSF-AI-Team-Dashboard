import Link from "next/link";
import { requireArea } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Flash, flashFrom } from "@/components/ops/flash";
import { EmptyState } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { field, labelCls, Pill, SearchBox, shortDate, StatusTabs, urlFor } from "@/components/crm";
import { cn } from "@/lib/utils";
import { saveRedFlag, toggleRedFlag } from "../actions";
import { vaClientOptions, type ClientOption } from "../data";

export const metadata = { title: "Red flags · VA Managers" };

type Flag = {
  id: string;
  client_id: string;
  va_name: string | null;
  focus: "client" | "va";
  manager_name: string | null;
  reason: string | null;
  rca: string | null;
  action_taken: string | null;
  status: "open" | "resolved";
  added_on: string;
  resolved_on: string | null;
  notes: string | null;
  updated_at: string;
  clients: { name: string } | null;
};

/** VA Managers › Red flags: clients or VAs at risk, with the reason, root cause (RCA) and action. Open → Resolved. */
export default async function RedFlagsPage(props: PageProps<"/d/va-managers/red-flags">) {
  await requireArea("clients");
  const sp = await props.searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).slice(0, 80) : "");
  const tab = one("tab") === "resolved" ? "resolved" : "open";
  const q = one("q");
  const supabase = await getServerSupabase();

  const [{ data, error }, open, resolved, clients] = await Promise.all([
    supabase.from("red_flags").select("*, clients(name)").eq("status", tab).order("added_on", { ascending: false }).order("id").limit(1000),
    supabase.from("red_flags").select("id", { count: "exact", head: true }).eq("status", "open"),
    supabase.from("red_flags").select("id", { count: "exact", head: true }).eq("status", "resolved"),
    vaClientOptions(),
  ]);
  if (error) throw new Error(error.message);
  const term = q.toLowerCase();
  const flags = ((data ?? []) as Flag[]).filter(
    (f) => !term || [f.clients?.name, f.va_name, f.reason, f.rca].some((v) => (v ?? "").toLowerCase().includes(term)),
  );
  const base = "/d/va-managers/red-flags";
  const params = { tab, q };
  const back = urlFor(base, params);

  return (
    <div className="space-y-5">
      <PageHeader title="Red flags" subtitle="Clients or VAs at risk: the reason, the root cause (RCA) and what we did about it." />
      <Flash msg={flashFrom(sp)} />
      <div className="flex flex-wrap items-center gap-3">
        <StatusTabs
          base={base}
          params={params}
          active={tab}
          items={[
            { key: "open", label: "Open", count: open.count ?? 0, tone: "red" },
            { key: "resolved", label: "Resolved", count: resolved.count ?? 0, tone: "green" },
          ]}
        />
        <SearchBox base={base} params={params} q={q} placeholder="Client, VA or reason" />
      </div>

      <details className="rounded-2xl border border-line bg-surface">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-brand-600">+ Add a red flag</summary>
        <FlagForm clients={clients} back={back} />
      </details>

      {flags.length === 0 ? (
        <EmptyState>{tab === "open" ? "No open red flags." : "No resolved red flags yet."}</EmptyState>
      ) : (
        <ul className="space-y-3">
          {flags.map((f) => (
            <li key={f.id} className="rounded-2xl border border-line bg-surface px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <Link href={`/clients/${f.client_id}`} className="font-semibold text-ink hover:text-brand-600 hover:underline">
                  {f.clients?.name ?? "Client"}
                </Link>
                {f.va_name && <span className="text-sm text-ink-muted">VA {f.va_name}</span>}
                <Pill tone={f.focus === "va" ? "violet" : "blue"}>{f.focus === "va" ? "VA" : "Client"}</Pill>
                <span className="text-xs text-ink-faint">
                  Added {shortDate(f.added_on)}
                  {f.manager_name ? ` · ${f.manager_name}` : ""}
                  {f.resolved_on ? ` · resolved ${shortDate(f.resolved_on)}` : ""}
                </span>
                <form action={toggleRedFlag} className="ml-auto">
                  <input type="hidden" name="id" value={f.id} />
                  <input type="hidden" name="updated_at" value={f.updated_at} />
                  <input type="hidden" name="to" value={f.status === "open" ? "resolved" : "open"} />
                  <input type="hidden" name="back" value={back} />
                  <SubmitButton size="sm" variant={f.status === "open" ? "primary" : "secondary"} pendingText="Saving…">
                    {f.status === "open" ? "Resolve" : "Reopen"}
                  </SubmitButton>
                </form>
              </div>
              <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-3">
                {[
                  ["Reason", f.reason],
                  ["RCA", f.rca],
                  ["Action taken", f.action_taken],
                ].map(([k, v]) => (
                  <div key={k as string}>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-ink-faint">{k}</dt>
                    <dd className={cn("mt-0.5", v ? "text-ink" : "text-amber-700 dark:text-amber-300")}>{v || "Not written yet"}</dd>
                  </div>
                ))}
              </dl>
              {f.notes && <p className="mt-2 text-xs text-ink-faint">{f.notes}</p>}
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-medium text-ink-faint hover:text-ink">Edit</summary>
                <FlagForm clients={clients} back={back} f={f} />
              </details>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FlagForm({ clients, back, f }: { clients: ClientOption[]; back: string; f?: Flag }) {
  return (
    <form action={saveRedFlag} className="grid grid-cols-1 gap-3 px-4 pb-4 pt-1 sm:grid-cols-2 lg:grid-cols-4">
      {f && <input type="hidden" name="id" value={f.id} />}
      {f && <input type="hidden" name="updated_at" value={f.updated_at} />}
      <input type="hidden" name="back" value={back} />
      {f ? (
        <input type="hidden" name="client_id" value={f.client_id} />
      ) : (
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
        VA
        <input name="va_name" defaultValue={f?.va_name ?? ""} className={field} />
      </label>
      <label className={labelCls}>
        About
        <select name="focus" defaultValue={f?.focus ?? "client"} className={field}>
          <option value="client">The client</option>
          <option value="va">The VA</option>
        </select>
      </label>
      <label className={cn(labelCls, "sm:col-span-2")}>
        Reason *
        <input name="reason" required defaultValue={f?.reason ?? ""} className={field} />
      </label>
      <label className={cn(labelCls, "sm:col-span-2")}>
        RCA (root cause)
        <input name="rca" defaultValue={f?.rca ?? ""} className={field} />
      </label>
      <label className={cn(labelCls, "sm:col-span-2")}>
        Action taken
        <input name="action_taken" defaultValue={f?.action_taken ?? ""} className={field} />
      </label>
      <label className={labelCls}>
        Manager
        <input name="manager_name" defaultValue={f?.manager_name ?? ""} className={field} />
      </label>
      <label className={labelCls}>
        Added on
        <input type="date" name="added_on" defaultValue={f?.added_on ?? ""} className={field} />
      </label>
      <label className={cn(labelCls, "sm:col-span-2 lg:col-span-3")}>
        Notes
        <input name="notes" defaultValue={f?.notes ?? ""} className={field} />
      </label>
      <input type="hidden" name="status" value={f?.status ?? "open"} />
      <div className="flex items-end">
        <SubmitButton size="sm" pendingText="Saving…">{f ? "Save changes" : "Add red flag"}</SubmitButton>
      </div>
    </form>
  );
}
