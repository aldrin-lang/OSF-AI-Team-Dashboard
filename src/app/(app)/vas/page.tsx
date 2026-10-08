import Link from "next/link";
import { requireArea } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select, Textarea } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { PLACEMENT_STATUS, type Tone } from "@/lib/labels";
import { dublinDate } from "@/lib/ops-core";
import { cn, formatDate, initials } from "@/lib/utils";
import type { PlacementStatus, VaPlacement } from "@/lib/types";
import { savePlacementDetails } from "./actions";
import { allRows } from "@/lib/server/paged";

export const metadata = { title: "VAs · OSF AI Team Dashboard" };

type Row = VaPlacement & { clients: { name: string } | null };
type Check = { placement_id: string; status: string; mood: string | null; due_on: string; sent_at: string | null };

const MOOD: Record<string, { label: string; tone: Tone }> = {
  good: { label: "Happy", tone: "green" },
  neutral: { label: "OK", tone: "blue" },
  at_risk: { label: "At risk", tone: "red" },
};

function tenure(start: string | null, today: string): string {
  if (!start) return "—";
  const days = Math.round((Date.parse(today) - Date.parse(start)) / 86_400_000);
  if (days < 0) return `starts in ${-days}d`;
  if (days < 60) return `${days}d`;
  const months = Math.floor(days / 30.4);
  return months < 24 ? `${months} mo` : `${(months / 12).toFixed(1)} yr`;
}

export default async function VasPage(props: PageProps<"/vas">) {
  await requireArea("clients");
  const sp = await props.searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const view = one("view") === "all" ? "all" : one("view") === "past" ? "past" : "active";
  const term = one("q").trim().toLowerCase().slice(0, 60);

  const supabase = await getServerSupabase();
  const [data, checks] = await Promise.all([
    allRows((a, b) => supabase.from("va_placements").select("*, clients(name)").order("created_at", { ascending: false }).order("id").range(a, b)),
    allRows((a, b) =>
      supabase
        .from("checkins")
        .select("placement_id, status, mood, due_on, sent_at")
        .eq("kind", "va")
        .order("due_on", { ascending: false })
        .order("id")
        .range(a, b),
    ),
  ]);
  const all = (data as Row[]) ?? [];
  const lastMood = new Map<string, Check>();
  const nextDue = new Map<string, string>();
  for (const c of (checks as Check[]) ?? []) {
    if (!c.placement_id) continue;
    if (c.mood && !lastMood.has(c.placement_id)) lastMood.set(c.placement_id, c);
    if (c.status === "due") nextDue.set(c.placement_id, c.due_on);
  }
  const today = dublinDate();

  const rows = all.filter((p) => {
    if (view === "active" && p.placement_status !== "active") return false;
    if (view === "past" && p.placement_status === "active") return false;
    if (!term) return true;
    return [p.va_name, p.va_email, p.role, p.clients?.name].some((v) => (v ?? "").toLowerCase().includes(term));
  });

  const active = all.filter((p) => p.placement_status === "active");
  const atRisk = active.filter((p) => lastMood.get(p.id)?.mood === "at_risk").length;
  const hours = active.reduce((s, p) => s + (p.hours_per_week ?? 0), 0);
  const clients = new Set(active.map((p) => p.client_id)).size;
  const tenures = active.filter((p) => p.start_date && p.start_date <= today).map((p) => (Date.parse(today) - Date.parse(p.start_date!)) / 86_400_000 / 30.4);
  const avgTenure = tenures.length ? tenures.reduce((a, b) => a + b, 0) / tenures.length : 0;

  const href = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ view, q: term, ...over })) if (v && !(k === "view" && v === "active")) p.set(k, v);
    const qs = p.toString();
    return qs ? `/vas?${qs}` : "/vas";
  };

  return (
    <div className="space-y-5">
      <PageHeader title="VAs" subtitle="Every VA we've placed, across all clients: who, where, how long and how they're doing" />

      <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-5">
        {[
          { n: active.length, l: "Active VAs" },
          { n: clients, l: "Clients served" },
          { n: hours ? hours.toLocaleString() : "—", l: "Hours / week" },
          { n: avgTenure ? `${avgTenure.toFixed(1)} mo` : "—", l: "Average tenure" },
          { n: atRisk, l: "At risk", warn: atRisk > 0 },
        ].map((t) => (
          <div key={t.l} className="glass rounded-2xl px-3 py-3">
            <p className={cn("text-2xl font-semibold text-ink", t.warn && "text-rose-500")}>{t.n}</p>
            <p className="text-xs text-ink-faint">{t.l}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(["active", "past", "all"] as const).map((v) => (
          <Link
            key={v}
            href={href({ view: v })}
            className={cn("rounded-full px-3 py-1 text-xs font-medium", view === v ? "bg-brand-500 text-white" : "bg-fill text-ink-muted hover:text-ink")}
          >
            {v === "active" ? "Active" : v === "past" ? "Past" : "All"}
          </Link>
        ))}
        <form className="ml-auto" action="/vas">
          {view !== "active" && <input type="hidden" name="view" value={view} />}
          <Input name="q" defaultValue={term} placeholder="Search VA, client, role" className="h-8 w-56" />
        </form>
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong px-4 py-12 text-center text-sm text-ink-faint">
          No VAs here yet. Hire someone from an open role (or add a placement on a client) and they&apos;ll show up.
        </div>
      ) : (
        <div className="glass overflow-x-auto rounded-2xl">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] uppercase tracking-wide text-ink-faint">
                <th className="px-4 py-2.5 font-semibold">VA</th>
                <th className="px-3 py-2.5 font-semibold">Client</th>
                <th className="px-3 py-2.5 font-semibold">Started</th>
                <th className="px-3 py-2.5 font-semibold">Rate · hours</th>
                <th className="px-3 py-2.5 font-semibold">Last check-in</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
                <th className="px-3 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const mood = lastMood.get(p.id);
                const due = nextDue.get(p.id);
                return (
                  <tr key={p.id} className="border-b border-line align-top last:border-0 hover:bg-fill">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-violet-500 text-[11px] font-semibold text-white">
                          {initials(p.va_name)}
                        </span>
                        <div className="min-w-0">
                          {p.candidate_id ? (
                            <Link href={`/candidates/${p.candidate_id}`} className="block truncate font-medium text-ink hover:text-brand-600">{p.va_name || "Unnamed VA"}</Link>
                          ) : (
                            <p className="truncate font-medium text-ink">{p.va_name || "Unnamed VA"}</p>
                          )}
                          <p className="truncate text-xs text-ink-faint">{p.role || "—"}{p.employment_type ? ` · ${p.employment_type}` : ""}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <Link href={`/clients/${p.client_id}`} className="text-ink hover:text-brand-600">{p.clients?.name ?? "—"}</Link>
                    </td>
                    <td className="px-3 py-3 text-ink-muted">
                      {p.start_date ? formatDate(p.start_date) : "—"}
                      <p className="text-xs text-ink-faint">{tenure(p.start_date, today)}</p>
                    </td>
                    <td className="px-3 py-3 text-ink-muted">
                      {p.hourly_rate != null ? `${p.rate_currency} ${Number(p.hourly_rate).toFixed(2)}/h` : "—"}
                      <p className="text-xs text-ink-faint">{p.hours_per_week ? `${p.hours_per_week}h/wk` : ""}</p>
                    </td>
                    <td className="px-3 py-3">
                      {mood?.mood ? <Badge tone={MOOD[mood.mood]?.tone ?? "neutral"}>{MOOD[mood.mood]?.label ?? mood.mood}</Badge> : <span className="text-xs text-ink-faint">None yet</span>}
                      {due && <p className={cn("mt-1 text-xs", due < today ? "text-rose-500" : "text-ink-faint")}>next {formatDate(due)}</p>}
                      {p.checkin_paused && <p className="mt-1 text-xs text-ink-faint">paused</p>}
                    </td>
                    <td className="px-3 py-3">
                      <Badge tone={PLACEMENT_STATUS[p.placement_status].tone}>{PLACEMENT_STATUS[p.placement_status].label}</Badge>
                    </td>
                    <td className="px-3 py-3 text-right">
                      <details className="relative inline-block text-left">
                        <summary className="cursor-pointer list-none rounded-lg px-2 py-1 text-xs font-medium text-brand-600 hover:bg-fill dark:text-brand-300">Edit</summary>
                        <form action={savePlacementDetails} className="glass card-glow absolute right-0 z-30 mt-1 grid w-80 grid-cols-2 gap-2 rounded-xl p-3">
                          <input type="hidden" name="id" value={p.id} />
                          <p className="col-span-2 text-xs font-semibold text-ink">{p.va_name} at {p.clients?.name}</p>
                          <div>
                            <Label>Start date</Label>
                            <Input name="start_date" type="date" defaultValue={p.start_date ?? ""} />
                          </div>
                          <div>
                            <Label>End date</Label>
                            <Input name="end_date" type="date" defaultValue={p.end_date ?? ""} />
                          </div>
                          <div>
                            <Label>Rate / hour</Label>
                            <Input name="hourly_rate" type="number" step="0.01" min={0} defaultValue={p.hourly_rate ?? ""} />
                          </div>
                          <div>
                            <Label>Currency</Label>
                            <Select name="rate_currency" defaultValue={p.rate_currency ?? "USD"}>
                              {["USD", "GBP", "EUR", "PHP", "AUD", "NZD", "CAD"].map((c) => <option key={c}>{c}</option>)}
                            </Select>
                          </div>
                          <div>
                            <Label>Hours / week</Label>
                            <Input name="hours_per_week" type="number" min={1} max={80} defaultValue={p.hours_per_week ?? ""} />
                          </div>
                          <div>
                            <Label>Status</Label>
                            <Select name="placement_status" defaultValue={p.placement_status}>
                              {(Object.keys(PLACEMENT_STATUS) as PlacementStatus[]).map((s) => (
                                <option key={s} value={s}>{PLACEMENT_STATUS[s].label}</option>
                              ))}
                            </Select>
                          </div>
                          <div className="col-span-2">
                            <Label>Notes</Label>
                            <Textarea name="notes" defaultValue={p.notes ?? ""} maxLength={2000} className="min-h-[60px]" />
                          </div>
                          <div className="col-span-2">
                            <SubmitButton size="sm" pendingText="Saving…" className="w-full">Save</SubmitButton>
                          </div>
                        </form>
                      </details>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
