import Link from "next/link";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireArea, hasRole } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select, EmptyState } from "@/components/ui/primitives";
import { LEAD_SERVICE } from "@/lib/labels";
import { relativeTime } from "@/lib/utils";
import { OPEN_STATUSES } from "@/lib/leads-ingest";
import { ghlConfigFromEnv } from "@/lib/server/leads";
import { SettersPanel } from "./setters-panel";
import { LeadRowControls } from "./lead-row-controls";
import type { Lead, Setter } from "@/lib/types";

export const metadata = { title: "Leads · AI Receptionist Ops" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function LeadsPage(props: PageProps<"/leads">) {
  const profile = await requireArea("leads");
  const sp = await props.searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");

  const view = ["open", "all", "history"].includes(one("view")) ? one("view") : "open";
  const service = ["ai", "va", "premium", "unknown"].includes(one("service")) ? one("service") : "all";
  const setterParam = one("setter");
  const setterFilter = setterParam === "unassigned" || UUID.test(setterParam) ? setterParam : "all";
  const term = one("q").replace(/[%,()*]/g, " ").trim().slice(0, 60);
  const msg = one("msg").slice(0, 300);

  const supabase = await getServerSupabase();

  let q = supabase.from("leads").select("*").order("received_at", { ascending: false }).limit(300);
  if (view === "history") q = q.eq("historical", true);
  else {
    q = q.eq("historical", false);
    if (view === "open") q = q.in("status", [...OPEN_STATUSES]);
  }
  if (service !== "all") q = q.eq("service", service);
  if (setterFilter === "unassigned") q = q.is("setter_id", null);
  else if (setterFilter !== "all") q = q.eq("setter_id", setterFilter);
  if (term) q = q.or(`name.ilike.%${term}%,email.ilike.%${term}%,phone.ilike.%${term}%`);

  const [{ data }, { data: setterRows }, { data: settings }, { data: openRows }] = await Promise.all([
    q,
    supabase.from("setters").select("*").order("name"),
    supabase.from("lead_settings").select("live_from").eq("id", 1).maybeSingle(),
    supabase
      .from("leads")
      .select("setter_id, status")
      .eq("historical", false)
      .in("status", [...OPEN_STATUSES])
      .limit(5000),
  ]);

  const leads = (data as Lead[]) ?? [];
  const setters = (setterRows as Setter[]) ?? [];
  const liveFrom = (settings?.live_from as string | null | undefined) ?? null;

  const open = openRows ?? [];
  const openCounts: Record<string, number> = {};
  for (const r of open) if (r.setter_id) openCounts[r.setter_id as string] = (openCounts[r.setter_id as string] ?? 0) + 1;
  const unassigned = open.filter((r) => !r.setter_id).length;
  const untouched = open.filter((r) => r.status === "new").length;

  const href = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    const cur: Record<string, string> = { view, service, setter: setterFilter, q: term };
    for (const [k, v] of Object.entries({ ...cur, ...over })) if (v && v !== "all") p.set(k, v);
    const qs = p.toString();
    return qs ? `/leads?${qs}` : "/leads";
  };

  const tabs = [
    { key: "open", label: "Open" },
    { key: "all", label: "All" },
    { key: "history", label: "History" },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Leads"
        subtitle="Every new lead from GHL, allocated to a setter"
      />

      {msg && (
        <div className="rounded-xl border border-line bg-white px-4 py-2.5 text-sm text-ink-muted">{msg}</div>
      )}

      <div className="grid grid-cols-3 gap-3 text-center">
        <div className="glass rounded-2xl px-3 py-3">
          <p className="text-2xl font-semibold text-ink">{open.length}</p>
          <p className="text-xs text-ink-faint">Open leads</p>
        </div>
        <div className="glass rounded-2xl px-3 py-3">
          <p className="text-2xl font-semibold text-ink">{untouched}</p>
          <p className="text-xs text-ink-faint">Not touched yet</p>
        </div>
        <div className="glass rounded-2xl px-3 py-3">
          <p className={`text-2xl font-semibold ${unassigned ? "text-accent-600" : "text-ink"}`}>{unassigned}</p>
          <p className="text-xs text-ink-faint">Unassigned</p>
        </div>
      </div>

      <SettersPanel
        setters={setters}
        openCounts={openCounts}
        liveFrom={liveFrom}
        unassigned={unassigned}
        canManage={hasRole(profile, "manager")}
        isAdmin={hasRole(profile, "admin")}
        syncConfigured={ghlConfigFromEnv() !== null}
      />

      <div className="flex gap-2 border-b border-line text-sm">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={href({ view: t.key })}
            className={`-mb-px border-b-2 px-3 py-2 font-medium ${
              view === t.key
                ? "border-brand-500 text-ink"
                : "border-transparent text-ink-faint hover:text-ink-muted"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <form method="get" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="view" value={view} />
        <div>
          <Input name="q" defaultValue={term} placeholder="Search name, email, phone" className="w-64" />
        </div>
        <Select name="service" defaultValue={service} className="w-40">
          <option value="all">All services</option>
          <option value="ai">AI receptionist</option>
          <option value="va">VA</option>
          <option value="premium">Premium VA</option>
          <option value="unknown">Unknown</option>
        </Select>
        <Select name="setter" defaultValue={setterFilter} className="w-44">
          <option value="all">All setters</option>
          <option value="unassigned">Unassigned</option>
          {setters.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </Select>
        <Button size="sm" variant="secondary" type="submit">
          Filter
        </Button>
        <Link href={href({ q: "", service: "all", setter: "all" })} className="px-1 pb-2 text-xs text-ink-faint hover:text-ink">
          Clear
        </Link>
      </form>

      {leads.length === 0 ? (
        <EmptyState>
          {view === "history"
            ? "No history yet. Leads that arrive before allocation is switched on are kept here."
            : "No leads match."}
        </EmptyState>
      ) : (
        <div className="glass overflow-x-auto rounded-2xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-faint">
                <th className="px-4 py-2.5 font-medium">Received</th>
                <th className="px-4 py-2.5 font-medium">Lead</th>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell">Service</th>
                <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Phone</th>
                <th className="px-4 py-2.5 font-medium">Status &amp; setter</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id} className="border-b border-line align-top last:border-0 hover:bg-fill">
                  <td className="whitespace-nowrap px-4 py-2.5 text-ink-faint">{relativeTime(l.received_at)}</td>
                  <td className="px-4 py-2.5">
                    <Link href={`/leads/${l.id}`} className="font-medium text-ink hover:underline">
                      {l.name || l.email || l.phone || "Unnamed lead"}
                    </Link>
                    <p className="text-xs text-ink-faint">
                      {[l.email, l.source, l.country, l.ad_code].filter(Boolean).join(" · ") || "—"}
                    </p>
                    {l.client_id && (
                      <Link href={`/clients/${l.client_id}`} className="text-xs text-brand-600 hover:underline">
                        Client →
                      </Link>
                    )}
                  </td>
                  <td className="hidden px-4 py-2.5 md:table-cell">
                    <Badge tone={LEAD_SERVICE[l.service].tone}>{LEAD_SERVICE[l.service].label}</Badge>
                    {l.va_role && <p className="mt-1 text-xs text-ink-faint">{l.va_role}</p>}
                  </td>
                  <td className="hidden px-4 py-2.5 lg:table-cell">
                    <span className="text-ink-muted">{l.phone ?? "—"}</span>
                    {l.phone_flag && (
                      <Badge
                        tone="amber"
                        className="ml-1.5"
                        title={
                          l.phone_flag === "likely_miscoded_353"
                            ? `Looks like a foreign number that GHL prefixed with +353. Best guess: ${l.phone_suggested ?? "?"}`
                            : "Number has no country code"
                        }
                      >
                        Check number
                      </Badge>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <LeadRowControls
                      key={`${l.id}-${l.status}-${l.setter_id ?? ""}`}
                      id={l.id}
                      status={l.status}
                      setterId={l.setter_id}
                      setters={setters.map((t) => ({ id: t.id, name: t.name }))}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {leads.length === 300 && (
        <p className="text-xs text-ink-faint">Showing the newest 300. Use the search or filters to narrow it down.</p>
      )}
    </div>
  );
}
