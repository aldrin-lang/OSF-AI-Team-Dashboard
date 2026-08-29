"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CHECKLIST_STATUS } from "@/lib/labels";
import { setChecklistStatus } from "../actions";
import { relativeTime } from "@/lib/utils";
import type { ChecklistStatus } from "@/lib/types";

type Item = {
  id: string;
  key: string;
  label: string;
  status: ChecklistStatus;
  completedBy: string | null;
  completedAt: string | null;
};

const ORDER: ChecklistStatus[] = ["todo", "doing", "done", "blocked", "na"];

export function Checklist({ clientId, items }: { clientId: string; items: Item[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();

  if (items.length === 0) {
    return <p className="px-4 py-4 text-sm text-ink-faint">No checklist items.</p>;
  }

  return (
    <ul className="divide-y divide-white/5">
      {items.map((it) => (
        <li key={it.id} className="flex items-center gap-3 px-4 py-2.5">
          <input
            type="checkbox"
            checked={it.status === "done"}
            disabled={pending}
            onChange={() =>
              start(async () => {
                await setChecklistStatus({
                  itemId: it.id,
                  clientId,
                  status: it.status === "done" ? "todo" : "done",
                });
                router.refresh();
              })
            }
            className="h-4 w-4 rounded border-line-strong accent-brand-500"
          />
          <div className="min-w-0 flex-1">
            <p className={`text-sm ${it.status === "done" ? "text-ink-faint line-through" : "text-ink"}`}>
              {it.label}
            </p>
            {it.status === "done" && it.completedAt && (
              <p className="text-xs text-ink-faint">
                {it.completedBy ? `${it.completedBy} · ` : ""}
                {relativeTime(it.completedAt)}
              </p>
            )}
          </div>
          <select
            value={it.status}
            disabled={pending}
            onChange={(e) =>
              start(async () => {
                await setChecklistStatus({
                  itemId: it.id,
                  clientId,
                  status: e.target.value,
                });
                router.refresh();
              })
            }
            className="h-7 rounded-lg border border-white/12 bg-white/[0.05] px-1 text-xs"
          >
            {ORDER.map((s) => (
              <option key={s} value={s}>
                {CHECKLIST_STATUS[s].label}
              </option>
            ))}
          </select>
        </li>
      ))}
    </ul>
  );
}
