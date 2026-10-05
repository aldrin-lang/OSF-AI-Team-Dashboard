"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, Textarea, Label } from "@/components/ui/primitives";
import { LEAD_STATUS } from "@/lib/labels";
import { updateLead } from "../actions";
import type { LeadStatus } from "@/lib/types";

export function LeadControls({
  lead,
  setters,
}: {
  lead: { id: string; status: LeadStatus; setter_id: string | null; notes: string | null };
  setters: { id: string; name: string }[];
}) {
  const router = useRouter();
  return (
    <form
      action={async (fd) => {
        await updateLead(fd);
        router.refresh();
      }}
      className="space-y-3"
    >
      <input type="hidden" name="id" value={lead.id} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label>Status</Label>
          <Select name="status" defaultValue={lead.status}>
            {Object.entries(LEAD_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Setter</Label>
          <Select name="setter_id" defaultValue={lead.setter_id ?? ""}>
            <option value="">Unassigned</option>
            {setters.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div>
        <Label>Notes</Label>
        <Textarea name="notes" defaultValue={lead.notes ?? ""} placeholder="What was said, next step…" />
      </div>
      <Button size="sm" type="submit">
        Save
      </Button>
    </form>
  );
}
