"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { moveClientStage } from "../actions";

type Stage = { id: string; name: string; allowed: boolean; blockedBy: string[] };

export function StageMover({
  clientId,
  currentStageId,
  stages,
}: {
  clientId: string;
  currentStageId: string | null;
  stages: Stage[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3">
      <p className="mb-2 text-xs font-medium text-neutral-400">Pipeline stage</p>
      <div className="flex flex-wrap gap-1.5">
        {stages.map((s) => {
          const isCurrent = s.id === currentStageId;
          return (
            <button
              key={s.id}
              disabled={pending || isCurrent}
              title={!s.allowed ? `Blocked: ${s.blockedBy.join(", ")}` : undefined}
              onClick={() => {
                setError(null);
                start(async () => {
                  const res = await moveClientStage({ clientId, toStageId: s.id });
                  if (!res.ok) setError(res.error ?? "Could not move");
                  else router.refresh();
                });
              }}
              className={[
                "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                isCurrent
                  ? "bg-neutral-900 text-white"
                  : s.allowed
                    ? "bg-neutral-100 text-neutral-700 hover:bg-neutral-200"
                    : "bg-neutral-50 text-neutral-300 cursor-not-allowed",
              ].join(" ")}
            >
              {s.name}
            </button>
          );
        })}
      </div>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
