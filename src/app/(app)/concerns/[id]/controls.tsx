"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, Textarea, Label } from "@/components/ui/primitives";
import { CONCERN_STATUS, CONCERN_SEVERITY } from "@/lib/labels";
import { updateConcern } from "../actions";
import type { ConcernSeverity, ConcernStatus } from "@/lib/types";

export function ConcernControls({
  concern,
  profiles,
}: {
  concern: {
    id: string;
    status: ConcernStatus;
    severity: ConcernSeverity;
    owner_id: string | null;
    resolution: string | null;
  };
  profiles: { id: string; name: string }[];
}) {
  const router = useRouter();
  return (
    <form
      action={async (fd) => {
        await updateConcern(fd);
        router.refresh();
      }}
      className="space-y-3"
    >
      <input type="hidden" name="id" value={concern.id} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <Label>Status</Label>
          <Select name="status" defaultValue={concern.status}>
            {Object.entries(CONCERN_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Severity</Label>
          <Select name="severity" defaultValue={concern.severity}>
            {Object.entries(CONCERN_SEVERITY).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Owner</Label>
          <Select name="owner_id" defaultValue={concern.owner_id ?? ""}>
            <option value="">Unassigned</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div>
        <Label>Resolution notes</Label>
        <Textarea name="resolution" defaultValue={concern.resolution ?? ""} />
      </div>
      <Button size="sm" type="submit">
        Save
      </Button>
    </form>
  );
}
