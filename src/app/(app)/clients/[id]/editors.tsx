"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/primitives";
import { CLIENT_STATUS, RB_STATUS, BUILD_STATUS, PLACEMENT_STATUS, HIRING_FEE_STATUS } from "@/lib/labels";
import { updateClient, upsertLine, deleteLine, upsertPlacement } from "../actions";
import type { Client, ClientLine, VaPlacement } from "@/lib/types";

function Disclosure({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        onClick={() => setOpen((o) => !o)}
        className="text-xs font-medium text-slate-500 hover:text-slate-900"
      >
        {open ? "− " : "+ "}
        {label}
      </button>
      {open && <div className="mt-2">{children}</div>}
    </div>
  );
}

export function EditClientPanel({
  client,
  profiles,
  canEditCommercials,
}: {
  client: Client;
  profiles: { id: string; name: string }[];
  canEditCommercials: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);
  return (
    <form
      action={(fd) =>
        start(async () => {
          await updateClient(fd);
          setSaved(true);
          router.refresh();
          setTimeout(() => setSaved(false), 2500);
        })
      }
      className="space-y-3"
    >
      <input type="hidden" name="id" value={client.id} />
        <div>
          <Label>Name</Label>
          <Input name="name" defaultValue={client.name} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Industry</Label>
            <Input name="industry" defaultValue={client.industry ?? ""} />
          </div>
          <div>
            <Label>Country</Label>
            <Input name="country" defaultValue={client.country ?? ""} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Source</Label>
            <Input name="source" defaultValue={client.source ?? ""} />
          </div>
          <div>
            <Label>Closed by</Label>
            <Input name="closed_by" defaultValue={client.closed_by ?? ""} />
          </div>
        </div>
        <div>
          <Label>Manager</Label>
          <Select name="manager_id" defaultValue={client.manager_id ?? ""}>
            <option value="">Unassigned</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label>Demo call</Label>
            <Input type="date" name="demo_call_date" defaultValue={client.demo_call_date ?? ""} />
          </div>
          <div>
            <Label>Start date</Label>
            <Input type="date" name="start_date" defaultValue={client.start_date ?? ""} />
          </div>
        </div>
        <div>
          <Label>Status</Label>
          <Select name="status" defaultValue={client.status}>
            {Object.entries(CLIENT_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </Select>
        </div>
        <div className="rounded-lg bg-slate-50 p-3">
          <p className="mb-2 text-xs font-semibold text-slate-500">
            Commercials {canEditCommercials ? "" : "(read-only — manager/admin can edit)"}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Setup fee (£)</Label>
              <Input name="setup_fee" type="number" step="0.01" defaultValue={client.setup_fee ?? ""} disabled={!canEditCommercials} />
            </div>
            <div>
              <Label>Daily rate (£)</Label>
              <Input name="daily_rate" type="number" step="0.01" defaultValue={client.daily_rate ?? ""} disabled={!canEditCommercials} />
            </div>
          </div>
          <div className="mt-2">
            <Label>Hiring fee status</Label>
            <Select name="hiring_fee_status" defaultValue={client.hiring_fee_status} disabled={!canEditCommercials}>
              {Object.entries(HIRING_FEE_STATUS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </Select>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <div>
              <Label>Invoice</Label>
              <Input name="hiring_fee_invoice" defaultValue={client.hiring_fee_invoice ?? ""} disabled={!canEditCommercials} />
            </div>
            <div>
              <Label>Paid</Label>
              <Input name="hiring_fee_paid" defaultValue={client.hiring_fee_paid ?? ""} disabled={!canEditCommercials} />
            </div>
          </div>
        </div>
        <div>
          <Label>Remarks</Label>
          <Textarea name="remarks" defaultValue={client.remarks ?? ""} />
        </div>
        <div className="flex items-center gap-3">
          <Button size="sm" type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save changes"}
          </Button>
          {saved && <span className="text-xs font-medium text-emerald-600">Saved ✓</span>}
        </div>
    </form>
  );
}

const BUILD_OPTS = Object.entries(BUILD_STATUS);
const RB_OPTS = Object.entries(RB_STATUS);

function LineForm({ clientId, line }: { clientId: string; line?: ClientLine }) {
  const router = useRouter();
  return (
    <form
      action={async (fd) => {
        await upsertLine(fd);
        router.refresh();
      }}
      className="space-y-2 rounded-md border border-slate-200 p-2"
    >
      <input type="hidden" name="client_id" value={clientId} />
      {line && <input type="hidden" name="id" value={line.id} />}
      <div className="grid grid-cols-2 gap-2">
        <Input name="label" placeholder="Label" defaultValue={line?.label ?? ""} />
        <Input name="ai_phone_number" placeholder="AI phone #" defaultValue={line?.ai_phone_number ?? ""} />
        <Input name="twilio_subaccount" placeholder="Twilio subaccount" defaultValue={line?.twilio_subaccount ?? ""} />
        <Input name="ghl_location_id" placeholder="GHL location id" defaultValue={line?.ghl_location_id ?? ""} />
        <Input name="booking_system" placeholder="Booking system" defaultValue={line?.booking_system ?? ""} />
        <Input name="dashboard_url" placeholder="Dashboard URL" defaultValue={line?.dashboard_url ?? ""} />
      </div>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <label>
          RB
          <Select name="regulatory_bundle_status" defaultValue={line?.regulatory_bundle_status ?? "not_started"}>
            {RB_OPTS.map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </Select>
        </label>
        <label>
          Prompt
          <Select name="prompt_status" defaultValue={line?.prompt_status ?? "not_started"}>
            {BUILD_OPTS.map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </Select>
        </label>
        <label>
          KB
          <Select name="kb_status" defaultValue={line?.kb_status ?? "not_started"}>
            {BUILD_OPTS.map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </Select>
        </label>
        <label>
          Workflow
          <Select name="workflow_status" defaultValue={line?.workflow_status ?? "not_started"}>
            {BUILD_OPTS.map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </Select>
        </label>
      </div>
      <div className="flex gap-2">
        <Button size="sm" type="submit">
          {line ? "Save line" : "Add line"}
        </Button>
        {line && (
          <Button
            size="sm"
            variant="ghost"
            type="button"
            onClick={async () => {
              await deleteLine({ id: line.id, clientId });
              router.refresh();
            }}
          >
            Delete
          </Button>
        )}
      </div>
    </form>
  );
}

export function LinesEditor({ clientId, lines }: { clientId: string; lines: ClientLine[] }) {
  return (
    <Disclosure label="Add / edit phone lines">
      <div className="space-y-3">
        {lines.map((l) => (
          <LineForm key={l.id} clientId={clientId} line={l} />
        ))}
        <LineForm clientId={clientId} />
      </div>
    </Disclosure>
  );
}

function PlacementForm({ clientId, placement }: { clientId: string; placement?: VaPlacement }) {
  const router = useRouter();
  return (
    <form
      action={async (fd) => {
        await upsertPlacement(fd);
        router.refresh();
      }}
      className="space-y-2 rounded-md border border-slate-200 p-2"
    >
      <input type="hidden" name="client_id" value={clientId} />
      {placement && <input type="hidden" name="id" value={placement.id} />}
      <div className="grid grid-cols-2 gap-2">
        <Input name="va_name" placeholder="VA name" defaultValue={placement?.va_name ?? ""} />
        <Input name="va_email" placeholder="VA email" defaultValue={placement?.va_email ?? ""} />
        <Input name="role" placeholder="Role" defaultValue={placement?.role ?? ""} />
        <Input name="employment_type" placeholder="Employment type" defaultValue={placement?.employment_type ?? ""} />
        <Input name="va_cv_url" placeholder="CV URL" defaultValue={placement?.va_cv_url ?? ""} />
        <Input name="tracker_url" placeholder="Tracker URL" defaultValue={placement?.tracker_url ?? ""} />
      </div>
      <label className="block text-xs">
        Status
        <Select name="placement_status" defaultValue={placement?.placement_status ?? "active"}>
          {Object.entries(PLACEMENT_STATUS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </Select>
      </label>
      <Button size="sm" type="submit">
        {placement ? "Save placement" : "Add placement"}
      </Button>
    </form>
  );
}

export function PlacementsEditor({
  clientId,
  placements,
}: {
  clientId: string;
  placements: VaPlacement[];
}) {
  return (
    <Disclosure label="Add / edit placements">
      <div className="space-y-3">
        {placements.map((p) => (
          <PlacementForm key={p.id} clientId={clientId} placement={p} />
        ))}
        <PlacementForm clientId={clientId} />
      </div>
    </Disclosure>
  );
}
