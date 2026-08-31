"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Search,
  Plus,
  KanbanSquare,
  Table2,
  ChevronRight,
  ExternalLink,
  X,
} from "lucide-react";
import { CLIENT_STATUS, RB_STATUS, HIRING_FEE_STATUS, type Tone, TONE_CLASS } from "@/lib/labels";
import { portalLinkFor } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { QuickView } from "./quick-view";
import { setClientField } from "./grid-actions";
import type { GridRow } from "@/lib/data/queries";
import type { PipelineStage } from "@/lib/types";

type Opt = { id: string; name: string };

export function ClientsGrid({
  rows: initial,
  stages,
  managers,
  sources,
  countries,
  myId,
  canEditFees,
}: {
  rows: GridRow[];
  stages: PipelineStage[];
  managers: Opt[];
  sources: string[];
  countries: string[];
  myId: string;
  canEditFees: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  // pull in fresh server data (own saves + teammates' live edits)
  useEffect(() => setRows(initial), [initial]);
  const [q, setQ] = useState("");
  const [fStage, setFStage] = useState("");
  const [fManager, setFManager] = useState("");
  const [mine, setMine] = useState(false);
  const [group, setGroup] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stageName = useMemo(() => new Map(stages.map((s) => [s.id, s.name])), [stages]);
  const stagePos = useMemo(
    () => new Map(rows.map((r) => [r.client.stage_id, r.stage?.position ?? 99])),
    [rows],
  );

  function flash(msg: string) {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }

  async function save(id: string, field: string, value: string | null, prev: unknown) {
    // optimistic
    setRows((rs) =>
      rs.map((r) => {
        if (r.client.id !== id) return r;
        const numeric = field.endsWith("_fee") || field === "daily_rate";
        const client = {
          ...r.client,
          [field]: numeric ? (value === null ? null : Number(value)) : value,
        };
        const patch: Partial<GridRow> = { client };
        if (field === "stage_id") {
          patch.stage = stages.find((s) => s.id === value) ?? null;
          patch.daysInStage = 0;
          patch.overSla = false;
        }
        if (field === "manager_id") {
          patch.managerName = managers.find((m) => m.id === value)?.name ?? null;
        }
        return { ...r, ...patch };
      }),
    );
    const res = await setClientField({ id, field, value });
    if (!res.ok) {
      flash(res.error ?? "Couldn't save");
      setRows((rs) =>
        rs.map((r) => (r.client.id === id ? { ...r, client: { ...r.client, [field]: prev } } : r)),
      );
    } else {
      router.refresh();
    }
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    let out = rows.filter((r) => {
      const c = r.client;
      if (s && !`${c.company_name ?? ""} ${c.name} ${c.country ?? ""}`.toLowerCase().includes(s))
        return false;
      if (fStage && c.stage_id !== fStage) return false;
      if (fManager === "unassigned" ? c.manager_id : fManager && c.manager_id !== fManager)
        return false;
      if (mine && c.manager_id !== myId) return false;
      return true;
    });
    out = out.sort((a, b) => {
      const pa = stagePos.get(a.client.stage_id) ?? 99;
      const pb = stagePos.get(b.client.stage_id) ?? 99;
      if (pa !== pb) return pa - pb;
      return (a.client.company_name || a.client.name).localeCompare(b.client.company_name || b.client.name);
    });
    return out;
  }, [rows, q, fStage, fManager, mine, myId, stagePos]);

  const grouped = useMemo(() => {
    if (!group) return [{ key: "", label: "", rows: filtered }];
    const map = new Map<string, GridRow[]>();
    for (const r of filtered) {
      const k = r.client.stage_id ?? "none";
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(r);
    }
    return stages
      .map((s) => ({ key: s.id, label: s.name, rows: map.get(s.id) ?? [] }))
      .concat(map.has("none") ? [{ key: "none", label: "No stage", rows: map.get("none")! }] : [])
      .filter((g) => g.rows.length);
  }, [filtered, group, stages]);

  const anyFilter = q || fStage || fManager || mine;

  return (
    <div className="space-y-3">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search…"
            className="h-9 w-44 rounded-lg border border-line bg-white pl-8 pr-3 text-sm text-ink placeholder:text-ink-faint focus-visible:border-brand-400 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand-500/30"
          />
        </div>
        <Sel value={fStage} onChange={setFStage} placeholder="All stages">
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Sel>
        <Sel value={fManager} onChange={setFManager} placeholder="All managers">
          <option value="unassigned">Unassigned</option>
          {managers.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </Sel>
        <Chip active={mine} onClick={() => setMine((v) => !v)}>
          Mine
        </Chip>
        <Chip active={group} onClick={() => setGroup((v) => !v)}>
          Group by stage
        </Chip>
        {anyFilter && (
          <button
            onClick={() => {
              setQ("");
              setFStage("");
              setFManager("");
              setMine(false);
            }}
            className="text-xs text-ink-faint hover:text-ink"
          >
            Clear
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-lg border border-line bg-white p-0.5">
            <span className="flex items-center gap-1 rounded-md bg-brand-500 px-2 py-1 text-xs font-medium text-white">
              <Table2 className="h-3.5 w-3.5" /> Table
            </span>
            <Link
              href="/pipeline"
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-ink-muted hover:bg-fill"
            >
              <KanbanSquare className="h-3.5 w-3.5" /> Board
            </Link>
          </div>
          <Link
            href="/clients/new"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-gradient-to-b from-brand-400 to-brand-600 px-3 text-sm font-medium text-white shadow-[0_8px_20px_-6px_rgba(43,127,255,0.5)] hover:from-brand-500 hover:to-brand-700"
          >
            <Plus className="h-4 w-4" /> New client
          </Link>
        </div>
      </div>

      {toast && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          <span className="flex-1">{toast}</span>
          <button onClick={() => setToast(null)}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      <p className="text-xs text-ink-faint">
        {filtered.length} client{filtered.length === 1 ? "" : "s"} · click any cell to edit
      </p>

      {/* grid */}
      <div className="glass overflow-x-auto rounded-2xl">
        <table className="w-full min-w-[1180px] border-separate border-spacing-0 text-sm">
          <thead>
            <tr className="[&>th]:sticky [&>th]:top-0 [&>th]:z-20 [&>th]:border-b [&>th]:border-line [&>th]:bg-white [&>th]:px-3 [&>th]:py-2.5 [&>th]:text-left [&>th]:text-[11px] [&>th]:font-semibold [&>th]:uppercase [&>th]:tracking-wide [&>th]:text-ink-faint">
              <th className="left-0 z-30 w-8" />
              <th className="left-8 z-30 min-w-[190px] shadow-[1px_0_0_0_var(--color-line)]">Company</th>
              <th className="min-w-[130px]">Contact</th>
              <th className="min-w-[150px]">Stage</th>
              <th className="min-w-[72px]">In&nbsp;stage</th>
              <th className="min-w-[130px]">Manager</th>
              <th className="min-w-[120px]">Status</th>
              <th className="min-w-[64px]">RB</th>
              <th className="min-w-[74px]">Build</th>
              <th className="min-w-[80px]">Concerns</th>
              <th className="min-w-[120px]">Country</th>
              <th className="min-w-[110px]">Source</th>
              <th className="min-w-[92px]">Setup&nbsp;£</th>
              <th className="min-w-[120px]">Hiring&nbsp;fee</th>
              <th className="min-w-[120px]">Start&nbsp;date</th>
              <th className="min-w-[56px]" />
            </tr>
          </thead>
          <tbody>
            {grouped.map((g) => (
              <GroupBlock
                key={g.key || "all"}
                label={g.label}
                rows={g.rows}
                grouped={group}
                stages={stages}
                managers={managers}
                sources={sources}
                countries={countries}
                canEditFees={canEditFees}
                onOpen={setOpenId}
                save={save}
              />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={16} className="px-4 py-10 text-center text-sm text-ink-faint">
                  No clients match.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <QuickView clientId={openId} onClose={() => setOpenId(null)} />
    </div>
  );
}

function GroupBlock({
  label,
  rows,
  grouped,
  stages,
  managers,
  sources,
  countries,
  canEditFees,
  onOpen,
  save,
}: {
  label: string;
  rows: GridRow[];
  grouped: boolean;
  stages: Opt[];
  managers: Opt[];
  sources: string[];
  countries: string[];
  canEditFees: boolean;
  onOpen: (id: string) => void;
  save: (id: string, field: string, value: string | null, prev: unknown) => void;
}) {
  return (
    <>
      {grouped && (
        <tr>
          <td
            colSpan={16}
            className="sticky left-0 border-b border-line bg-fill px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-muted"
          >
            {label} · {rows.length}
          </td>
        </tr>
      )}
      {rows.map((r) => (
        <Row
          key={r.client.id}
          r={r}
          stages={stages}
          managers={managers}
          sources={sources}
          countries={countries}
          canEditFees={canEditFees}
          onOpen={onOpen}
          save={save}
        />
      ))}
    </>
  );
}

const RISK = (r: GridRow) => {
  if (r.openConcerns > 0 && r.overSla) return "bg-rose-500";
  if (r.overSla || r.openConcerns > 0 || r.client.status === "paused") return "bg-accent-500";
  return "bg-emerald-400";
};

function Row({
  r,
  stages,
  managers,
  sources,
  countries,
  canEditFees,
  onOpen,
  save,
}: {
  r: GridRow;
  stages: Opt[];
  managers: Opt[];
  sources: string[];
  countries: string[];
  canEditFees: boolean;
  onOpen: (id: string) => void;
  save: (id: string, field: string, value: string | null, prev: unknown) => void;
}) {
  const c = r.client;
  const td = "border-b border-line px-3 py-1.5 align-middle";
  return (
    <tr className="group hover:bg-brand-50/40">
      <td className={`${td} sticky left-0 z-10 bg-white group-hover:bg-[#eff5ff] w-8 text-center`}>
        <button
          onClick={() => onOpen(c.id)}
          className="rounded p-1 text-ink-faint hover:bg-fill hover:text-ink"
          title="Open details"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </td>
      <td className={`${td} sticky left-8 z-10 bg-white shadow-[1px_0_0_0_var(--color-line)] group-hover:bg-[#eff5ff]`}>
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 shrink-0 rounded-full ${RISK(r)}`} />
          <div className="min-w-0">
            <EditableText value={c.company_name || c.name} onSave={(v) => save(c.id, "company_name", v, c.company_name)} bold />
          </div>
        </div>
      </td>
      <td className={td}>
        <EditableText value={c.name} onSave={(v) => save(c.id, "name", v, c.name)} />
      </td>
      <td className={td}>
        <CellSelect
          value={c.stage_id ?? ""}
          onChange={(v) => save(c.id, "stage_id", v, c.stage_id)}
          options={stages.map((s) => ({ value: s.id, label: s.name }))}
        />
      </td>
      <td className={`${td} tabular-nums ${r.overSla ? "font-semibold text-rose-600" : "text-ink-muted"}`}>
        {r.daysInStage != null ? `${r.daysInStage}d` : "—"}
      </td>
      <td className={td}>
        <CellSelect
          value={c.manager_id ?? ""}
          onChange={(v) => save(c.id, "manager_id", v, c.manager_id)}
          options={[{ value: "", label: "Unassigned" }, ...managers.map((m) => ({ value: m.id, label: m.name }))]}
        />
      </td>
      <td className={td}>
        <CellSelect
          value={c.status}
          onChange={(v) => save(c.id, "status", v, c.status)}
          options={Object.entries(CLIENT_STATUS).map(([k, v]) => ({ value: k, label: v.label }))}
          tone={CLIENT_STATUS[c.status].tone}
        />
      </td>
      <td className={td}>
        {r.lineCount === 0 ? (
          <span className="text-ink-faint">—</span>
        ) : (
          <span
            className={`rounded-md px-1.5 py-0.5 text-xs font-medium ${
              r.rbApproved === r.lineCount ? "bg-emerald-50 text-emerald-700" : "bg-accent-500/10 text-accent-600"
            }`}
          >
            {r.rbApproved}/{r.lineCount}
          </span>
        )}
      </td>
      <td className={`${td} text-xs text-ink-muted`}>
        {r.checklistTotal ? `${r.checklistDone}/${r.checklistTotal}` : "—"}
      </td>
      <td className={td}>
        {r.openConcerns > 0 ? (
          <Link href="/concerns" className="rounded-md bg-rose-50 px-1.5 py-0.5 text-xs font-semibold text-rose-600">
            {r.openConcerns}
          </Link>
        ) : (
          <span className="text-ink-faint">—</span>
        )}
      </td>
      <td className={td}>
        <CellSelect
          value={c.country ?? ""}
          onChange={(v) => save(c.id, "country", v, c.country)}
          options={[{ value: "", label: "—" }, ...countries.map((x) => ({ value: x, label: x }))]}
          free
        />
      </td>
      <td className={td}>
        <CellSelect
          value={c.source ?? ""}
          onChange={(v) => save(c.id, "source", v, c.source)}
          options={[{ value: "", label: "—" }, ...sources.map((x) => ({ value: x, label: x }))]}
        />
      </td>
      <td className={td}>
        {canEditFees ? (
          <EditableText
            value={c.setup_fee != null ? String(c.setup_fee) : ""}
            onSave={(v) => save(c.id, "setup_fee", v, c.setup_fee)}
            numeric
          />
        ) : (
          <span className="text-ink-muted">{c.setup_fee != null ? `£${c.setup_fee}` : "—"}</span>
        )}
      </td>
      <td className={td}>
        {canEditFees ? (
          <CellSelect
            value={c.hiring_fee_status}
            onChange={(v) => save(c.id, "hiring_fee_status", v, c.hiring_fee_status)}
            options={Object.entries(HIRING_FEE_STATUS).map(([k, v]) => ({ value: k, label: v.label }))}
            tone={HIRING_FEE_STATUS[c.hiring_fee_status].tone}
          />
        ) : (
          <span className="text-ink-muted">{HIRING_FEE_STATUS[c.hiring_fee_status].label}</span>
        )}
      </td>
      <td className={td}>
        <EditableDate value={c.start_date} onSave={(v) => save(c.id, "start_date", v, c.start_date)} />
      </td>
      <td className={`${td} text-right`}>
        <div className="flex items-center justify-end gap-0.5">
          <a
            href={portalLinkFor(c)}
            target="_blank"
            rel="noreferrer"
            title="Client portal"
            className="rounded p-1 text-ink-faint hover:bg-fill hover:text-brand-600"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <Link
            href={`/clients/${c.id}`}
            title="Full page"
            className="rounded p-1 text-ink-faint hover:bg-fill hover:text-ink"
          >
            <Table2 className="h-3.5 w-3.5" />
          </Link>
        </div>
      </td>
    </tr>
  );
}

/* ---------- cell editors ---------- */

function EditableText({
  value,
  onSave,
  bold,
  numeric,
}: {
  value: string;
  onSave: (v: string) => void;
  bold?: boolean;
  numeric?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [v, setV] = useState(value);
  if (editing) {
    return (
      <input
        autoFocus
        type={numeric ? "number" : "text"}
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (v !== value) onSave(v);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setV(value);
            setEditing(false);
          }
        }}
        className="w-full rounded border border-brand-400 bg-white px-1.5 py-0.5 text-sm outline-none"
      />
    );
  }
  return (
    <button
      onClick={() => {
        setV(value);
        setEditing(true);
      }}
      className={`block w-full truncate rounded px-1.5 py-0.5 text-left hover:bg-fill ${
        bold ? "font-medium text-navy-800" : "text-ink-muted"
      } ${!value ? "text-ink-faint" : ""}`}
    >
      {value || (numeric ? "—" : "Add")}
    </button>
  );
}

function EditableDate({ value, onSave }: { value: string | null; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  if (editing) {
    return (
      <input
        autoFocus
        type="date"
        defaultValue={value ?? ""}
        onBlur={(e) => {
          setEditing(false);
          if ((e.target.value || "") !== (value || "")) onSave(e.target.value);
        }}
        className="w-full rounded border border-brand-400 bg-white px-1.5 py-0.5 text-sm outline-none"
      />
    );
  }
  return (
    <button
      onClick={() => setEditing(true)}
      className="block w-full rounded px-1.5 py-0.5 text-left text-ink-muted hover:bg-fill"
    >
      {value ? formatDate(value) : <span className="text-ink-faint">Set</span>}
    </button>
  );
}

function CellSelect({
  value,
  onChange,
  options,
  tone,
  free,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  tone?: Tone;
  free?: boolean;
}) {
  const label = options.find((o) => o.value === value)?.label ?? value ?? "—";
  return (
    <div className="relative">
      <select
        value={options.some((o) => o.value === value) ? value : free ? "__free" : value}
        onChange={(e) => e.target.value !== "__free" && onChange(e.target.value)}
        className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
      >
        {free && !options.some((o) => o.value === value) && value && (
          <option value="__free">{value}</option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <span
        className={`pointer-events-none flex items-center gap-1 truncate rounded px-1.5 py-0.5 peer-hover:bg-fill peer-focus:ring-2 peer-focus:ring-brand-500/30 ${
          tone ? `text-xs font-medium ring-1 ring-inset ${TONE_CLASS[tone]}` : "text-ink-muted"
        } ${!value ? "text-ink-faint" : ""}`}
      >
        {label}
      </span>
    </div>
  );
}

function Sel({
  value,
  onChange,
  placeholder,
  children,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-lg border border-line bg-white px-2 text-sm text-ink-muted focus-visible:border-brand-400 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-brand-500/30"
    >
      <option value="">{placeholder}</option>
      {children}
    </select>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`h-9 rounded-lg border px-3 text-xs font-medium transition-colors ${
        active
          ? "border-brand-300 bg-brand-50 text-brand-700"
          : "border-line bg-white text-ink-muted hover:bg-fill"
      }`}
    >
      {children}
    </button>
  );
}
