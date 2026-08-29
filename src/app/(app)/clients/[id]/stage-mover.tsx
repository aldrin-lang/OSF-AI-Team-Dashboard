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
    <div className="glass rounded-xl p-3">
      <p className="mb-2 text-xs font-medium text-ink-faint">Pipeline stage</p>
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
                  ? "bg-brand-500 text-white"
                  : s.allowed
                    ? "bg-fill-strong text-ink-muted hover:bg-fill-strong"
                    : "bg-fill text-ink-faint cursor-not-allowed",
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
