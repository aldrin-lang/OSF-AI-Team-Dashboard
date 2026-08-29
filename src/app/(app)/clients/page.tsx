import Link from "next/link";
import { getClients, getProfiles, getStages, profileMap } from "@/lib/data/queries";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/primitives";
import { CLIENT_STATUS } from "@/lib/labels";
import { daysSince } from "@/lib/utils";
import { ClientFilters } from "./client-filters";
import type { PipelineType } from "@/lib/types";

export const metadata = { title: "Clients · AI Receptionist Ops" };

export default async function ClientsPage(props: PageProps<"/clients">) {
  const sp = await props.searchParams;
  const pipeline = (sp.type === "va" ? "va" : "ai") as PipelineType;
  const get = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : undefined);

  const [profiles, stages, clients] = await Promise.all([
    getProfiles(),
    getStages(pipeline),
    getClients({
      pipeline,
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
        subtitle={`${clients.length} ${pipeline === "ai" ? "AI receptionist" : "virtual assistant"} client${clients.length === 1 ? "" : "s"}`}
        actions={
          <Link href={`/clients/new?type=${pipeline}`}>
            <Button size="sm">New client</Button>
          </Link>
        }
      />

      <div className="flex gap-2 border-b border-neutral-200 text-sm">
        <PipeTab active={pipeline === "ai"} href="/clients?type=ai" label="AI Receptionist" />
        <PipeTab active={pipeline === "va"} href="/clients?type=va" label="Virtual Assistant" />
      </div>

      <ClientFilters
        pipeline={pipeline}
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
        <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-200 text-left text-xs text-neutral-400">
                <th className="px-4 py-2.5 font-medium">Client</th>
                <th className="px-4 py-2.5 font-medium">Stage</th>
                <th className="px-4 py-2.5 font-medium">In stage</th>
                <th className="px-4 py-2.5 font-medium">Manager</th>
                <th className="px-4 py-2.5 font-medium">Country</th>
                <th className="px-4 py-2.5 font-medium">Source</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => {
                const st = c.stage_id ? stageById.get(c.stage_id) : null;
                const dis = daysSince(c.stage_entered_at);
                const over = st?.sla_days != null && dis != null && dis > st.sla_days;
                const meta = CLIENT_STATUS[c.status];
                return (
                  <tr key={c.id} className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50">
                    <td className="px-4 py-2.5">
                      <Link href={`/clients/${c.id}`} className="font-medium text-neutral-900 hover:underline">
                        {c.name}
                      </Link>
                      {c.industry && <p className="text-xs text-neutral-400">{c.industry}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-neutral-600">{st?.name ?? "—"}</td>
                    <td className={`px-4 py-2.5 ${over ? "text-red-600 font-medium" : "text-neutral-500"}`}>
                      {dis != null ? `${dis}d` : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-neutral-600">
                      {c.manager_id ? pm.get(c.manager_id)?.full_name ?? "—" : "—"}
                    </td>
                    <td className="px-4 py-2.5 text-neutral-600">{c.country ?? "—"}</td>
                    <td className="px-4 py-2.5 text-neutral-600">{c.source ?? "—"}</td>
                    <td className="px-4 py-2.5">
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

function PipeTab({ active, href, label }: { active: boolean; href: string; label: string }) {
  return (
    <Link
      href={href}
      className={`-mb-px border-b-2 px-3 py-2 font-medium ${
        active
          ? "border-neutral-900 text-neutral-900"
          : "border-transparent text-neutral-400 hover:text-neutral-700"
      }`}
    >
      {label}
    </Link>
  );
}
