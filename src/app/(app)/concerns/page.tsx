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
      <div className="flex gap-2 border-b border-slate-200 text-sm">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/concerns?status=${t.key}`}
            className={`-mb-px border-b-2 px-3 py-2 font-medium ${
              statusFilter === t.key
                ? "border-slate-900 text-slate-900"
                : "border-transparent text-slate-400 hover:text-slate-700"
            }`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {concerns.length === 0 ? (
        <EmptyState>No concerns here.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200/70 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-400">
                <th className="px-4 py-2.5 font-medium">Client</th>
                <th className="px-4 py-2.5 font-medium">Concern</th>
                <th className="px-4 py-2.5 font-medium">Severity</th>
                <th className="px-4 py-2.5 font-medium">Owner</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Raised</th>
              </tr>
            </thead>
            <tbody>
              {concerns.map((c) => (
                <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-2.5 text-slate-600">{clientName.get(c.client_id) ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <Link href={`/concerns/${c.id}`} className="font-medium text-slate-900 hover:underline">
                      {c.title}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={CONCERN_SEVERITY[c.severity].tone}>{CONCERN_SEVERITY[c.severity].label}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">
                    {c.owner_id ? pm.get(c.owner_id)?.full_name ?? "—" : "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={CONCERN_STATUS[c.status].tone}>{CONCERN_STATUS[c.status].label}</Badge>
                  </td>
                  <td className="px-4 py-2.5 text-slate-400">{relativeTime(c.raised_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
