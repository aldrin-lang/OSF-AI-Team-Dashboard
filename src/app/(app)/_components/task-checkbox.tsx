"use client";

import { useTransition } from "react";
import { toggleTask } from "@/app/(app)/clients/actions";

export function TaskCheckbox({
  id,
  status,
  clientId,
}: {
  id: string;
  status: "open" | "done";
  clientId: string | null;
}) {
  const [pending, start] = useTransition();
  return (
    <input
      type="checkbox"
      checked={status === "done"}
      disabled={pending}
      onChange={() =>
        start(() =>
          toggleTask({ id, status: status === "done" ? "open" : "done", clientId }),
        )
      }
      className="h-4 w-4 rounded border-neutral-300 accent-neutral-900"
      aria-label="Toggle task done"
    />
  );
}
