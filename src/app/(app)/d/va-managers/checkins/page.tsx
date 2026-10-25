import Link from "next/link";
import { requireArea } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { allRows } from "@/lib/server/paged";
import { dublinDate } from "@/lib/ops-core";
import { checkinDateFor, checkinState, type CheckinState } from "@/lib/ops-records";
import { PageHeader } from "@/components/page-header";
import { Flash, flashFrom } from "@/components/ops/flash";
import { EmptyState } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { fieldSm, Pill, SearchBox, shortDate, StatusTabs, urlFor } from "@/components/crm";
import { cn } from "@/lib/utils";
import { logCheckin, setCheckinDay } from "../actions";

export const metadata = { title: "Monthly check-ins · VA Managers" };

const TABS: { key: CheckinState; label: string; tone: "amber" | "red" | "green" }[] = [
  { key: "due", label: "Due this month", tone: "amber" },
  { key: "overdue", label: "Overdue", tone: "red" },
  { key: "done", label: "Done this month", tone: "green" },
];
const MOOD: Record<string, { label: string; tone: "green" | "grey" | "red" }> = {
  good: { label: "Good", tone: "green" },
  neutral: { label: "Okay", tone: "grey" },
  at_risk: { label: "At risk", tone: "red" },
};
type Client = { id: string; name: string; status: string; checkin_day: number | null; csm_name: string | null; phone: string | null };
type Check = { client_id: string; due_on: string; status: string; mood: string | null; reply: string | null; sent_at: string | null };

/**
 * VA Managers › Monthly check-ins: every current VA client with a check-in day. This month's
 * check-in is due, overdue (its day has passed) or done. Log it right here after the call.
 */
export default async function MonthlyCheckinsPage(props: PageProps<"/d/va-managers/checkins">) {
  await requireArea("clients");
  const sp = await props.searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).slice(0, 80) : "");
  const today = dublinDate();
  const monthStart = today.slice(0, 8) + "01";
  const supabase = await getServerSupabase();

  const [clients, checks, placements] = await Promise.all([
    allRows<Client>((a, b) =>
      supabase.from("clients").select("id, name, status, checkin_day, csm_name, phone").eq("pipeline", "va").in("status", ["live", "active", "paused"]).order("name").order("id").range(a, b),
    ),
    allRows<Check>((a, b) =>
      supabase.from("checkins").select("client_id, due_on, status, mood, reply, sent_at").eq("kind", "client").in("status", ["done", "replied"]).order("due_on", { ascending: false }).order("id").range(a, b),
    ),
    allRows<{ client_id: string; va_name: string | null }>((a, b) =>
      supabase.from("va_placements").select("client_id, va_name").eq("placement_status", "active").order("id").range(a, b),
    ),
  ]);
  const last = new Map<string, Check>();
  const thisMonth = new Map<string, Check>();
  for (const c of checks) {
    if (!last.has(c.client_id)) last.set(c.client_id, c);
    if (c.due_on >= monthStart && !thisMonth.has(c.client_id)) thisMonth.set(c.client_id, c);
  }
  const vas = new Map<string, string[]>();
  for (const p of placements) if (p.va_name) vas.set(p.client_id, [...(vas.get(p.client_id) ?? []), p.va_name]);

  const withDay = clients.filter((c) => c.checkin_day);
  const noDay = clients.filter((c) => !c.checkin_day && vas.has(c.id));
  const managers = [...new Set(withDay.map((c) => c.csm_name).filter(Boolean))].sort() as string[];
  const who = one("who");
  const q = one("q").toLowerCase();
  const rows = withDay
    .filter((c) => !who || c.csm_name === who)
    .filter((c) => !q || c.name.toLowerCase().includes(q) || (vas.get(c.id) ?? []).some((v) => v.toLowerCase().includes(q)))
    .map((c) => ({ c, state: checkinState(c.checkin_day!, today, thisMonth.has(c.id)), date: checkinDateFor(c.checkin_day!, today) }));
  const tab = (TABS.some((t) => t.key === one("tab")) ? one("tab") : rows.some((r) => r.state === "overdue") ? "overdue" : "due") as CheckinState;
  const shown = rows.filter((r) => r.state === tab).sort((a, b) => a.date.localeCompare(b.date) || a.c.name.localeCompare(b.c.name));
  const base = "/d/va-managers/checkins";
  const params = { tab, who, q };
  const back = urlFor(base, params);

  return (
    <div className="space-y-5">
      <PageHeader title="Monthly check-ins" subtitle="Each current VA client's monthly check-in. Log it here after the call." />
      <Flash msg={flashFrom(sp)} />
      <StatusTabs base={base} params={params} active={tab} items={TABS.map((t) => ({ ...t, count: rows.filter((r) => r.state === t.key).length }))} />

      <div className="flex flex-wrap items-center gap-3">
        <SearchBox base={base} params={params} q={one("q")} placeholder="Find a client or VA" />
        <div className="flex flex-wrap gap-1.5">
          {["", ...managers].map((m) => (
            <Link
              key={m || "all"}
              href={urlFor(base, params, { who: m })}
              className={cn("rounded-full border px-3 py-1 text-xs font-semibold", who === m ? "border-brand-600 bg-brand-600 text-white" : "border-line text-ink-muted hover:bg-fill")}
            >
              {m || "Everyone"}
            </Link>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState>Nothing here{who ? ` for ${who}` : ""}.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[980px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="px-4 py-2.5 font-semibold">Client</th>
                <th className="px-3 py-2.5 font-semibold">VAs</th>
                <th className="px-3 py-2.5 font-semibold">Manager</th>
                <th className="px-3 py-2.5 font-semibold">Check-in</th>
                <th className="px-3 py-2.5 font-semibold">Last check-in</th>
                <th className="px-4 py-2.5 font-semibold">{tab === "done" ? "This month" : "Log it"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {shown.map(({ c, date, state }) => {
                const l = last.get(c.id);
                const now = thisMonth.get(c.id);
                return (
                  <tr key={c.id} className="align-top">
                    <td className="px-4 py-2.5">
                      <Link href={`/clients/${c.id}`} className="font-semibold text-ink hover:text-brand-600 hover:underline">
                        {c.name}
                      </Link>
                      {c.phone && <span className="block text-xs text-ink-faint">{c.phone}</span>}
                    </td>
                    <td className="px-3 py-2.5 text-ink-muted">{(vas.get(c.id) ?? []).join(", ") || "—"}</td>
                    <td className="px-3 py-2.5 text-ink-muted">{c.csm_name || "—"}</td>
                    <td className="px-3 py-2.5">
                      <span className={cn("font-medium", state === "overdue" ? "text-red-600 dark:text-red-400" : "text-ink")}>{shortDate(date)}</span>
                      <details className="mt-1">
                        <summary className="cursor-pointer text-xs text-ink-faint hover:text-ink">Day {c.checkin_day} · change</summary>
                        <form action={setCheckinDay} className="mt-1.5 flex flex-wrap items-center gap-1.5">
                          <input type="hidden" name="client_id" value={c.id} />
                          <input type="hidden" name="back" value={back} />
                          <input name="checkin_day" defaultValue={c.checkin_day ?? ""} inputMode="numeric" aria-label="Check-in day" className={cn(fieldSm, "w-14")} />
                          <input name="csm_name" defaultValue={c.csm_name ?? ""} placeholder="Manager" aria-label="Manager" className={cn(fieldSm, "w-24")} />
                          <SubmitButton size="sm" variant="secondary" pendingText="…">Save</SubmitButton>
                        </form>
                      </details>
                    </td>
                    <td className="px-3 py-2.5 text-ink-muted">
                      {l ? (
                        <>
                          {shortDate(l.sent_at?.slice(0, 10) ?? l.due_on)} {l.mood && MOOD[l.mood] && <Pill tone={MOOD[l.mood].tone}>{MOOD[l.mood].label}</Pill>}
                        </>
                      ) : (
                        "Never logged"
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {state === "done" && now ? (
                        <div className="max-w-[320px] text-xs text-ink-muted">
                          {now.mood && MOOD[now.mood] && <Pill tone={MOOD[now.mood].tone}>{MOOD[now.mood].label}</Pill>} {now.reply}
                        </div>
                      ) : (
                        <form action={logCheckin} className="flex flex-wrap items-center gap-1.5">
                          <input type="hidden" name="client_id" value={c.id} />
                          <input type="hidden" name="due_on" value={date} />
                          <input type="hidden" name="back" value={back} />
                          <input type="date" name="done_on" defaultValue={today} aria-label="Date of the call" className={cn(fieldSm, "w-36")} />
                          <select name="mood" defaultValue="good" aria-label="How it went" className={fieldSm}>
                            <option value="good">Good</option>
                            <option value="neutral">Okay</option>
                            <option value="at_risk">At risk</option>
                          </select>
                          <input name="note" placeholder="Note from the call" aria-label="Note" className={cn(fieldSm, "w-48")} />
                          <SubmitButton size="sm" pendingText="Saving…">Done</SubmitButton>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {noDay.length > 0 && (
        <details className="rounded-2xl border border-line bg-surface">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-ink">
            {noDay.length} current client{noDay.length === 1 ? "" : "s"} with a VA but no check-in day yet
          </summary>
          <ul className="divide-y divide-line">
            {noDay.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
                <span className="min-w-[14rem] font-medium text-ink">{c.name}</span>
                <span className="text-ink-faint">{(vas.get(c.id) ?? []).join(", ")}</span>
                <form action={setCheckinDay} className="ml-auto flex items-center gap-1.5">
                  <input type="hidden" name="client_id" value={c.id} />
                  <input type="hidden" name="back" value={back} />
                  <input name="checkin_day" placeholder="Day" inputMode="numeric" aria-label="Check-in day" className={cn(fieldSm, "w-16")} />
                  <input name="csm_name" placeholder="Manager" aria-label="Manager" className={cn(fieldSm, "w-24")} />
                  <SubmitButton size="sm" variant="secondary" pendingText="…">Set</SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
