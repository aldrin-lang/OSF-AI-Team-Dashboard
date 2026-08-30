import { requireProfile, hasRole } from "@/lib/auth";
import { getClientsGrid, getOptions } from "@/lib/data/queries";
import { PageHeader } from "@/components/page-header";
import { ClientsGrid } from "./clients/clients-grid";

export const metadata = { title: "Clients · OSF AI Team Dashboard" };

export default async function ClientsHome() {
  const me = await requireProfile();
  const [{ rows, stages, profiles }, sources, countries] = await Promise.all([
    getClientsGrid(),
    getOptions("source"),
    getOptions("country"),
  ]);

  const active = rows.filter(
    (r) => !["withdrawn", "rejected", "churned"].includes(r.client.status),
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Clients"
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
      />
    </div>
  );
}
