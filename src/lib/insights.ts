import type { ChecklistItem, Client, ClientLine, PipelineStage } from "@/lib/types";
import { daysSince } from "@/lib/utils";

/**
 * The single most useful next step for a client, from its stage + checklist + RB.
 */
export function nextAction(
  client: Client,
  stage: PipelineStage | null,
  checklist: ChecklistItem[],
  lines: ClientLine[],
): { label: string; tone: "brand" | "amber" | "green" | "neutral" } {
  if (["withdrawn", "rejected", "churned"].includes(client.status)) {
    return { label: "Closed — no action", tone: "neutral" };
  }
  if (stage?.name === "Live") {
    return { label: "Live — monitor for concerns", tone: "green" };
  }

  const rb = lines[0]?.regulatory_bundle_status;
  if (rb === "rejected") return { label: "Fix & resubmit Regulatory Bundle", tone: "amber" };
  if (rb === "docs_needed") return { label: "Chase client for RB documents", tone: "amber" };

  const firstOpen = [...checklist]
    .sort((a, b) => a.position - b.position)
    .find((c) => c.status !== "done" && c.status !== "na");
  if (firstOpen) {
    const verb =
      firstOpen.status === "blocked"
        ? "Unblock"
        : firstOpen.status === "doing"
          ? "Finish"
          : "Start";
    return { label: `${verb}: ${firstOpen.label}`, tone: "brand" };
  }

  return { label: "Advance to the next stage", tone: "brand" };
}

export type Risk = { level: "ok" | "watch" | "risk"; reasons: string[] };

export function assessRisk(
  client: Client,
  stage: PipelineStage | null,
  openConcerns: number,
): Risk {
  const reasons: string[] = [];
  const inStage = daysSince(client.stage_entered_at);
  const idle = daysSince(client.updated_at);

  if (stage?.sla_days != null && inStage != null && inStage > stage.sla_days) {
    reasons.push(`${inStage}d in ${stage.name} (SLA ${stage.sla_days}d)`);
  }
  if (idle != null && idle >= 10) reasons.push(`no update in ${idle}d`);
  if (openConcerns > 0) reasons.push(`${openConcerns} open concern${openConcerns > 1 ? "s" : ""}`);
  if (client.status === "paused") reasons.push("paused");

  const level: Risk["level"] =
    reasons.length === 0 ? "ok" : reasons.length >= 2 || client.status === "paused" ? "risk" : "watch";
  return { level, reasons };
}
