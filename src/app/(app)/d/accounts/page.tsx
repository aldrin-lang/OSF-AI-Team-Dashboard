import Link from "next/link";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Flash, flashFrom } from "@/components/ops/flash";
import { cn } from "@/lib/utils";
import { money, owedOf, stageOf, type ClientPayment } from "@/lib/client-payments";
import { loadAccounts } from "./data";
import { StageTiles } from "./parts";

export const metadata = { title: "Accounts · OSF AI Team Dashboard" };

const SHOW = { current: "Current clients", past: "Past clients", all: "All" } as const;
type Show = keyof typeof SHOW;
const PAST = ["churned", "withdrawn", "rejected"];

/**
 * Accounts › All clients: every client in the CRM (a new client appears here as soon as it is added),
 * with what they owe and their latest payment. Click a client for their payment record.
 */
export default async function AccountsPage(props: PageProps<"/d/accounts">) {
  const sp = await props.searchParams;
  const { clients, payments, today } = await loadAccounts();
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase().slice(0, 80) : "";
  const show: Show = sp.show === "past" || sp.show === "all" ? sp.show : "current";

  const byClient = new Map<string, ClientPayment[]>();
  for (const p of payments) byClient.set(p.client_id, [...(byClient.get(p.client_id) ?? []), p]);
  const list = clients
    .filter((c) => (show === "all" ? true : show === "past" ? PAST.includes(c.status) : !PAST.includes(c.status)))
    .filter((c) => !q || c.name.toLowerCase().includes(q))
    .map((c) => {
      const mine = byClient.get(c.id) ?? []; // newest period first
      const unpaid = mine.filter((p) => stageOf(p, today) === "not-paid");
      const owed = mine.filter((p) => stageOf(p, today) !== "paid" && p.invoice_no).reduce((a, p) => a + owedOf(p), 0);
      const lastPaid = mine.filter((p) => p.paid_on).map((p) => p.paid_on as string).sort().at(-1) ?? null;
      const vas = [...new Set(mine.filter((p) => p.period_start === mine[0]?.period_start).map((p) => p.va_name).filter(Boolean))];
      return { c, mine, unpaid, owed, lastPaid, vas, last: mine[0] };
    })
    .sort((a, b) => b.unpaid.length - a.unpaid.length || b.owed - a.owed || a.c.name.localeCompare(b.c.name));

  const href = (extra: Record<string, string>) => "/d/accounts?" + new URLSearchParams({ ...(q ? { q } : {}), show, ...extra }).toString();

  return (
    <div className="space-y-5">
      <PageHeader title="Accounts" subtitle="Every client's payments. Open a client to see and update their payment record." />
      <Flash msg={flashFrom(sp)} />
      <StageTiles payments={payments} today={today} />

      <div className="flex flex-wrap items-center gap-3">
        <form method="get" action="/d/accounts" className="relative">
          <input type="hidden" name="show" value={show} />
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Find a client"
            className="h-9 w-64 rounded-lg border border-line bg-surface pl-8 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-brand-400 focus:outline-none"
          />
        </form>
        <div className="flex gap-1.5">
          {(Object.keys(SHOW) as Show[]).map((k) => (
            <Link
              key={k}
              href={href({ show: k })}
              className={cn("rounded-full border px-3 py-1 text-xs font-semibold", show === k ? "border-brand-600 bg-brand-600 text-white" : "border-line text-ink-muted hover:bg-fill")}
            >
              {SHOW[k]}
            </Link>
          ))}
        </div>
        <span className="text-sm text-ink-faint">{list.length} clients</span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
        <table className="w-full min-w-[820px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
              <th className="px-4 py-2.5 font-semibold">Client</th>
              <th className="px-3 py-2.5 font-semibold">VAs</th>
              <th className="px-3 py-2.5 font-semibold">Latest period</th>
              <th className="px-3 py-2.5 text-right font-semibold">Owed</th>
              <th className="px-3 py-2.5 font-semibold">Not paid yet</th>
              <th className="px-4 py-2.5 font-semibold">Last paid</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {list.map(({ c, mine, unpaid, owed, lastPaid, vas, last }) => (
              <tr key={c.id} className="hover:bg-fill/60">
                <td className="px-4 py-2.5">
                  <Link href={`/d/accounts/client/${c.id}`} className="font-semibold text-ink hover:text-brand-600 hover:underline">
                    {c.name}
                  </Link>
                  <span className="ml-2 text-xs capitalize text-ink-faint">
                    {c.pipeline === "ai" ? "AI receptionist" : "VA"} · {c.status}
                    {c.country ? ` · ${c.country}` : ""}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-ink-muted">{vas.length ? vas.join(", ") : <span className="text-ink-faint">—</span>}</td>
                <td className="px-3 py-2.5 text-ink-muted">{last ? last.period_label : <span className="text-ink-faint">No payments yet</span>}</td>
                <td className={cn("px-3 py-2.5 text-right tabular-nums", owed > 0 ? "font-semibold text-ink" : "text-ink-faint")}>{owed > 0 ? money(owed) : "—"}</td>
                <td className="px-3 py-2.5">
                  {unpaid.length ? (
                    <span className="rounded-full bg-red-500/12 px-2 py-0.5 text-xs font-semibold text-red-700 dark:text-red-300">
                      {unpaid.length} · {money(unpaid.reduce((a, p) => a + owedOf(p), 0))}
                    </span>
                  ) : mine.length ? (
                    <span className="text-xs text-ink-faint">None</span>
                  ) : null}
                </td>
                <td className="px-4 py-2.5 text-ink-muted">
                  {lastPaid ? new Date(`${lastPaid}T12:00:00Z`).toLocaleDateString("en-IE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
