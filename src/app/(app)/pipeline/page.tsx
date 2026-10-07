import { requireArea } from "@/lib/auth";
import { getClients, getProfiles, getStages, profileMap } from "@/lib/data/queries";
import { getServerSupabase } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { assessRisk } from "@/lib/insights";
import { Board } from "./board";
import type { PipelineStage } from "@/lib/types";
import { getService } from "@/lib/server/service";
import { SERVICE_INFO, pipelinesFor } from "@/lib/service";

export const metadata = { title: "Pipeline · OSF AI Team Dashboard" };

export default async function PipelinePage() {
  await requireArea("clients");
  const service = await getService();
  const pipes = pipelinesFor(service);
  const supabase = await getServerSupabase();
  const [stages, clientLists, profiles, { data: concernRows }] = await Promise.all([
    getStages(),
    Promise.all(pipes.map((p) => getClients({ pipeline: p }))),
    getProfiles(),
    supabase.from("concerns").select("client_id").neq("status", "resolved"),
  ]);
  const pm = profileMap(profiles);
  const stageById = new Map<string, PipelineStage>(stages.map((s) => [s.id, s]));

  const concernCount = new Map<string, number>();
  for (const r of (concernRows as { client_id: string }[]) ?? []) {
    concernCount.set(r.client_id, (concernCount.get(r.client_id) ?? 0) + 1);
  }

  const clients = clientLists.flat();
  const cards = clients.map((c) => ({
    id: c.id,
    pipeline: c.pipeline,
    name: c.company_name || c.name,
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
        title={service === "all" ? "Pipeline" : `Pipeline · ${SERVICE_INFO[service].label}`}
        subtitle={
          atRisk > 0
            ? `Drag between stages · ${atRisk} client${atRisk > 1 ? "s" : ""} at risk`
            : "Drag a client between stages · click a card to edit"
        }
      />
      {pipes.map((p) => (
        <section key={p} className="space-y-2">
          {pipes.length > 1 && <h2 className="text-sm font-semibold text-ink">{p === "va" ? "VA Outsourcing" : "AI Receptionist"}</h2>}
          {stages.some((s) => s.pipeline === p) ? (
            <Board
              stages={stages.filter((s) => s.pipeline === p).map((s) => ({ id: s.id, name: s.name, slaDays: s.sla_days }))}
              cards={cards.filter((c) => c.pipeline === p)}
            />
          ) : (
            <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-ink-faint">
              No {p === "va" ? "VA" : "AI"} pipeline stages yet. Run the latest database update in Supabase.
            </p>
          )}
        </section>
      ))}
    </div>
  );
}
