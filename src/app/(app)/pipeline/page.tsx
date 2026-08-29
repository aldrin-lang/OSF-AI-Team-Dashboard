import { getClients, getProfiles, getStages, profileMap } from "@/lib/data/queries";
import { PageHeader } from "@/components/page-header";
import { Board } from "./board";

export const metadata = { title: "Pipeline · OSF AI Team Dashboard" };

export default async function PipelinePage() {
  const [stages, clients, profiles] = await Promise.all([
    getStages("ai"),
    getClients({ pipeline: "ai" }),
    getProfiles(),
  ]);
  const pm = profileMap(profiles);

  const cards = clients.map((c) => ({
    id: c.id,
    name: c.name,
    stageId: c.stage_id,
    manager: c.manager_id ? pm.get(c.manager_id)?.full_name ?? null : null,
    country: c.country,
    stageEnteredAt: c.stage_entered_at,
    status: c.status,
  }));

  return (
    <div className="space-y-4">
      <PageHeader title="Pipeline" subtitle="Drag a client between onboarding stages" />
      <Board
        stages={stages.map((s) => ({ id: s.id, name: s.name, slaDays: s.sla_days }))}
        cards={cards}
      />
    </div>
  );
}
