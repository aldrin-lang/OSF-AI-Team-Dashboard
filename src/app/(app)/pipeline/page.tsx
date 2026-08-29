import Link from "next/link";
import { getClients, getProfiles, getStages, profileMap } from "@/lib/data/queries";
import { PageHeader } from "@/components/page-header";
import { Board } from "./board";
import type { PipelineType } from "@/lib/types";

export const metadata = { title: "Pipeline · AI Receptionist Ops" };

export default async function PipelinePage(props: PageProps<"/pipeline">) {
  const sp = await props.searchParams;
  const pipeline = (sp.type === "va" ? "va" : "ai") as PipelineType;

  const [stages, clients, profiles] = await Promise.all([
    getStages(pipeline),
    getClients({ pipeline }),
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
      <PageHeader
        title="Pipeline"
        subtitle="Drag a client between stages"
        actions={
          <div className="flex gap-1 text-sm">
            <Link
              href="/pipeline?type=ai"
              className={`rounded-md px-3 py-1.5 ${pipeline === "ai" ? "bg-neutral-900 text-white" : "text-neutral-500 hover:bg-neutral-100"}`}
            >
              AI
            </Link>
            <Link
              href="/pipeline?type=va"
              className={`rounded-md px-3 py-1.5 ${pipeline === "va" ? "bg-neutral-900 text-white" : "text-neutral-500 hover:bg-neutral-100"}`}
            >
              VA
            </Link>
          </div>
        }
      />
      <Board
        stages={stages.map((s) => ({ id: s.id, name: s.name, slaDays: s.sla_days }))}
        cards={cards}
      />
    </div>
  );
}
