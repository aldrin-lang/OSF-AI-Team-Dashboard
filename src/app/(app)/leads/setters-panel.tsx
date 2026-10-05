import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDate } from "@/lib/utils";
import { assignUnassignedNow, startAllocating, syncNow, toggleSetter } from "./actions";
import type { Setter } from "@/lib/types";

/** Allocation state, setter on/off switches, and the Sync / Assign buttons. */
export function SettersPanel({
  setters,
  openCounts,
  liveFrom,
  unassigned,
  canManage,
  isAdmin,
  syncConfigured,
}: {
  setters: Setter[];
  openCounts: Record<string, number>;
  liveFrom: string | null;
  unassigned: number;
  canManage: boolean;
  isAdmin: boolean;
  syncConfigured: boolean;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Allocation</CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        {liveFrom === null ? (
          <div className="rounded-xl border border-accent-500/30 bg-accent-500/10 px-4 py-3 text-sm text-ink">
            <p className="font-medium">Allocation is OFF.</p>
            <p className="mt-0.5 text-ink-muted">
              Leads are being recorded but not assigned to anyone. Turn it on when the team is ready to work from
              this page; only leads created after that moment are assigned, older ones stay in History.
            </p>
            {isAdmin && (
              <form action={startAllocating} className="mt-3">
                <Button size="sm" type="submit">
                  Start allocating from now
                </Button>
              </form>
            )}
          </div>
        ) : (
          <p className="text-sm text-ink-muted">
            Allocating leads created since <span className="font-medium text-ink">{formatDate(liveFrom)}</span>,
            round-robin across the active setters below. To pause, switch every setter off — leads then stay
            visible as Unassigned.
          </p>
        )}

        <ul className="divide-y divide-line rounded-xl border border-line">
          {setters.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <div className="flex items-center gap-2.5">
                <span className="font-medium text-ink">{t.name}</span>
                <Badge tone={t.active ? "green" : "neutral"}>{t.active ? "On" : "Off"}</Badge>
                <span className="text-xs text-ink-faint">{openCounts[t.id] ?? 0} open</span>
              </div>
              {canManage && (
                <form action={toggleSetter}>
                  <input type="hidden" name="id" value={t.id} />
                  <input type="hidden" name="active" value={t.active ? "false" : "true"} />
                  <Button size="sm" variant="secondary" type="submit">
                    Switch {t.active ? "off" : "on"}
                  </Button>
                </form>
              )}
            </li>
          ))}
        </ul>

        <div className="flex flex-wrap gap-2">
          <form action={syncNow}>
            <Button size="sm" variant="secondary" type="submit" disabled={!syncConfigured}>
              Sync now from GHL
            </Button>
          </form>
          {canManage && liveFrom !== null && (
            <form action={assignUnassignedNow}>
              <Button size="sm" variant="secondary" type="submit" disabled={unassigned === 0}>
                Assign {unassigned} unassigned
              </Button>
            </form>
          )}
        </div>
        {!syncConfigured && (
          <p className="text-xs text-ink-faint">
            Sync is disabled until GHL_API_TOKEN and GHL_LOCATION_ID are set on the server (see HANDOVER.md).
          </p>
        )}
      </CardBody>
    </Card>
  );
}
