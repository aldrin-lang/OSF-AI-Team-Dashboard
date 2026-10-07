import { requireArea, hasRole } from "@/lib/auth";
import { getClientsGrid, getOptions } from "@/lib/data/queries";
import { PageHeader } from "@/components/page-header";
import { ClientsGrid } from "./clients/clients-grid";
import { getService } from "@/lib/server/service";
import { SERVICE_INFO, pipelinesFor } from "@/lib/service";

export const metadata = { title: "Clients · OSF AI Team Dashboard" };

export default async function ClientsHome() {
  const me = await requireArea("clients");
  const service = await getService();
  const [{ rows, stages, profiles }, sources, countries] = await Promise.all([
    getClientsGrid(pipelinesFor(service)),
    getOptions("source"),
    getOptions("country"),
  ]);

  const active = rows.filter(
    (r) => !["withdrawn", "rejected", "churned"].includes(r.client.status),
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title={service === "all" ? "Clients" : `Clients · ${SERVICE_INFO[service].label}`}
        subtitle={`${active.length} active · ${rows.filter((r) => r.client.status === "live").length} live · ${rows.filter((r) => r.overSla).length} past SLA`}
      />
      <ClientsGrid
        rows={rows}
        stages={stages}
        managers={profiles.map((p) => ({ id: p.id, name: p.full_name || p.email }))}
        sources={sources}
        countries={countries}
        myId={me.id}
        canEditFees={hasRole(me, "manager")}
        service={service}
      />
    </div>
  );
}
