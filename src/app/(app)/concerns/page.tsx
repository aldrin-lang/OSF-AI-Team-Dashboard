import Link from "next/link";
import { getServerSupabase } from "@/lib/supabase/server";
import { getProfiles, profileMap } from "@/lib/data/queries";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/primitives";
import { CONCERN_STATUS, CONCERN_SEVERITY } from "@/lib/labels";
import { relativeTime } from "@/lib/utils";
import type { Concern } from "@/lib/types";

export const metadata = { title: "Concerns · AI Receptionist Ops" };

export default async function ConcernsPage(props: PageProps<"/concerns">) {
  const sp = await props.searchParams;
  const statusFilter = typeof sp.status === "string" ? sp.status : "open";

  const supabase = await getServerSupabase();
  let q = supabase.from("concerns").select("*").order("raised_at", { ascending: false });
  if (statusFilter !== "all") {
    if (statusFilter === "open") q = q.neq("status", "resolved");
    else q = q.eq("status", statusFilter);
  }
  const [{ data }, profiles] = await Promise.all([q, getProfiles()]);
  const concerns = (data as Concern[]) ?? [];
  const pm = profileMap(profiles);

  const clientIds = [...new Set(concerns.map((c) => c.client_id))];
  const { data: clientRows } = clientIds.length
    ? await supabase.from("clients").select("id, name").in("id", clientIds)
    : { data: [] as { id: string; name: string }[] };
  const clientName = new Map((clientRows ?? []).map((c) => [c.id, c.name]));

  const tabs = [
    { key: "open", label: "Open" },
    { key: "resolved", label: "Resolved" },
    { key: "all", label: "All" },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Concerns"
        subtitle="Post-go-live issues raised against clients"
        actions={
          <Link href="/concerns/new">
            <Button size="sm">Raise concern</Button>
          </Link>
        }
      />
      <div className="flex gap-2 border-b border-line text-sm">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/concerns?status=${t.key}`}
            className={`-mb-px border-b-2 px-3 py-2 font-medium ${
              statusFilter === t.key
                ? "border-brand-500 text-ink"
                : "border-transparent text-ink-faint hover:text-ink-muted"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {concerns.length === 0 ? (
        <EmptyState>No concerns here.</EmptyState>
      ) : (
        <div className="glass overflow-x-auto rounded-2xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-faint">
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Client</th>
                <th className="px-4 py-2.5 font-medium">Concern</th>
                <th className="px-4 py-2.5 font-medium">Severity</th>
                <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Owner</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="hidden px-4 py-2.5 font-medium sm:table-cell">Raised</th>
              </tr>
            </thead>
            <tbody>
              {concerns.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-0 hover:bg-fill">
                  <td className="hidden px-4 py-2.5 text-ink-muted sm:table-cell">{clientName.get(c.client_id) ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <Link href={`/concerns/${c.id}`} className="font-medium text-ink hover:underline">
                      {c.title}
                    </Link>
                    <p className="text-xs text-ink-faint sm:hidden">{clientName.get(c.client_id) ?? "—"}</p>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={CONCERN_SEVERITY[c.severity].tone}>{CONCERN_SEVERITY[c.severity].label}</Badge>
                  </td>
                  <td className="hidden px-4 py-2.5 text-ink-muted lg:table-cell">
                    {c.owner_id ? pm.get(c.owner_id)?.full_name ?? "—" : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={CONCERN_STATUS[c.status].tone}>{CONCERN_STATUS[c.status].label}</Badge>
                  </td>
                  <td className="hidden px-4 py-2.5 text-ink-faint sm:table-cell">{relativeTime(c.raised_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
