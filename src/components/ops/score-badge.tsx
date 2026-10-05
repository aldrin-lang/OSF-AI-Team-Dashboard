import { Badge } from "@/components/ui/badge";
import type { Tone } from "@/lib/labels";

export function scoreTone(score: number): Tone {
  if (score >= 80) return "green";
  if (score >= 60) return "blue";
  if (score >= 40) return "amber";
  return "red";
}

export function ScoreBadge({ score }: { score: number | null }) {
  if (score == null) return null;
  return <Badge tone={scoreTone(score)}>{score}/100</Badge>;
}
