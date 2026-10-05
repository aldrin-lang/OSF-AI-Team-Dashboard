"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/primitives";
import { LEAD_STATUS } from "@/lib/labels";
import { updateLead } from "./actions";
import type { LeadStatus } from "@/lib/types";

/** Inline status + setter pickers for one row of the leads table. */
export function LeadRowControls({
  id,
  status,
  setterId,
  setters,
}: {
  id: string;
  status: LeadStatus;
  setterId: string | null;
  setters: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [st, setSt] = useState<string>(status);
  const [sid, setSid] = useState<string>(setterId ?? "");

  function save(next: { status?: string; setter_id?: string }) {
    start(async () => {
      const fd = new FormData();
      fd.set("id", id);
      if (next.status !== undefined) fd.set("status", next.status);
      if (next.setter_id !== undefined) fd.set("setter_id", next.setter_id);
      await updateLead(fd);
      router.refresh();
    });
  }

  return (
    <div className={`flex flex-wrap gap-2 ${pending ? "opacity-60" : ""}`} aria-busy={pending}>
      <Select
        aria-label="Status"
        className="h-8 w-36 text-xs"
        value={st}
        onChange={(e) => {
          setSt(e.target.value);
          save({ status: e.target.value });
        }}
      >
        {Object.entries(LEAD_STATUS).map(([k, v]) => (
          <option key={k} value={k}>
            {v.label}
          </option>
        ))}
      </Select>
      <Select
        aria-label="Setter"
        className="h-8 w-36 text-xs"
        value={sid}
        onChange={(e) => {
          setSid(e.target.value);
          save({ setter_id: e.target.value });
        }}
      >
        <option value="">Unassigned</option>
        {setters.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </Select>
    </div>
  );
}
