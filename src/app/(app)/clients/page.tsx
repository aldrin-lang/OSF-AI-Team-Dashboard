import Link from "next/link";
import { getClients, getProfiles, getStages, profileMap } from "@/lib/data/queries";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/primitives";
import { CLIENT_STATUS } from "@/lib/labels";
import { daysSince } from "@/lib/utils";
import { ClientFilters } from "./client-filters";

export const metadata = { title: "Clients · OSF AI Team Dashboard" };

export default async function ClientsPage(props: PageProps<"/clients">) {
  const sp = await props.searchParams;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);

  const [profiles, stages, clients] = await Promise.all([
    getProfiles(),
    getStages("ai"),
    getClients({
      pipeline: "ai",
      managerId: get("manager"),
      country: get("country"),
      source: get("source"),
      stageId: get("stage"),
      status: get("status"),
      search: get("q"),
    }),
  ]);
  const pm = profileMap(profiles);
  const stageById = new Map(stages.map((s) => [s.id, s]));

  return (
    <div className="space-y-5">
      <PageHeader
        title="Clients"
        subtitle={`${clients.length} AI receptionist client${clients.length === 1 ? "" : "s"}`}
        actions={
          <Link href="/clients/new">
            <Button size="sm">New client</Button>
          </Link>
        }
      />

      <ClientFilters
        profiles={profiles.map((p) => ({ id: p.id, name: p.full_name || p.email }))}
        stages={stages.map((s) => ({ id: s.id, name: s.name }))}
        current={{
          manager: get("manager"),
          country: get("country"),
          source: get("source"),
          stage: get("stage"),
          status: get("status"),
          q: get("q"),
        }}
      />

      {clients.length === 0 ? (
        <EmptyState>No clients match these filters.</EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface/70 backdrop-blur-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-faint">
                <th className="px-4 py-3 font-medium">Client</th>
                <th className="px-4 py-3 font-medium">Stage</th>
                <th className="px-4 py-3 font-medium">In stage</th>
                <th className="px-4 py-3 font-medium">Manager</th>
                <th className="px-4 py-3 font-medium">Country</th>
                <th className="px-4 py-3 font-medium">Source</th>
                <th className="px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => {
                const st = c.stage_id ? stageById.get(c.stage_id) : null;
                const dis = daysSince(c.stage_entered_at);
                const over = st?.sla_days != null && dis != null && dis > st.sla_days;
                const meta = CLIENT_STATUS[c.status];
                return (
                  <tr key={c.id} className="border-b border-line last:border-0 hover:bg-white/[0.04]">
                    <td className="px-4 py-3">
                      <Link href={`/clients/${c.id}`} className="font-medium text-ink hover:text-brand-300 hover:underline">
                        {c.name}
                      </Link>
                      {c.industry && <p className="text-xs text-ink-faint">{c.industry}</p>}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{st?.name ?? "—"}</td>
                    <td className={`px-4 py-3 ${over ? "font-medium text-red-400" : "text-ink-muted"}`}>
                      {dis != null ? `${dis}d` : "—"}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">
                      {c.manager_id ? pm.get(c.manager_id)?.full_name ?? "—" : "—"}
                    </td>
                    <td className="px-4 py-3 text-ink-muted">{c.country ?? "—"}</td>
                    <td className="px-4 py-3 text-ink-muted">{c.source ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Badge tone={meta.tone}>{meta.label}</Badge>
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
