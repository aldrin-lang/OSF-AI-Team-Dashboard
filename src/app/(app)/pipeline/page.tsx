import { getClients, getProfiles, getStages, profileMap } from "@/lib/data/queries";
import { getServerSupabase } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { assessRisk } from "@/lib/insights";
import { Board } from "./board";
import type { PipelineStage } from "@/lib/types";

export const metadata = { title: "Pipeline · OSF AI Team Dashboard" };

export default async function PipelinePage() {
  const supabase = await getServerSupabase();
  const [stages, clients, profiles, { data: concernRows }] = await Promise.all([
    getStages("ai"),
    getClients({ pipeline: "ai" }),
    getProfiles(),
    supabase.from("concerns").select("client_id").neq("status", "resolved"),
  ]);
  const pm = profileMap(profiles);
  const stageById = new Map<string, PipelineStage>(stages.map((s) => [s.id, s]));

  const concernCount = new Map<string, number>();
  for (const r of (concernRows as { client_id: string }[]) ?? []) {
    concernCount.set(r.client_id, (concernCount.get(r.client_id) ?? 0) + 1);
  }

  const cards = clients.map((c) => ({
    id: c.id,
    name: c.name,
    stageId: c.stage_id,
    manager: c.manager_id ? pm.get(c.manager_id)?.full_name ?? null : null,
    country: c.country,
    stageEnteredAt: c.stage_entered_at,
    status: c.status,
    risk: assessRisk(
      c,
      c.stage_id ? stageById.get(c.stage_id) ?? null : null,
      concernCount.get(c.id) ?? 0,
    ).level,
  }));

  const atRisk = cards.filter((c) => c.risk === "risk").length;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Pipeline"
        subtitle={
          atRisk > 0
            ? `Drag between stages · ${atRisk} client${atRisk > 1 ? "s" : ""} at risk`
            : "Drag a client between stages · click a card to edit"
        }
      />
      <Board
        stages={stages.map((s) => ({ id: s.id, name: s.name, slaDays: s.sla_days }))}
        cards={cards}
      />
    </div>
  );
}
