"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownAZ,
  ArrowUpAZ,
  ArrowLeft,
  ArrowRight,
  Calendar,
  CheckSquare,
  ChevronDown,
  CircleDollarSign,
  Download,
  Hash,
  Link2,
  List,
  Plus,
  Search,
  Trash2,
  Type,
  UserRound,
  X,
} from "lucide-react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import { getBrowserSupabase } from "@/lib/supabase/client";
import { cn, initials } from "@/lib/utils";
import {
  COLUMN_TYPES,
  COLUMN_TYPE_LABEL,
  SHEET_CURRENCIES,
  choiceTone,
  compareCells,
  formatCell,
  parseCell,
  parsePasted,
  rawCell,
  toCsv,
  type CellValue,
  type ColumnType,
  type SheetColumn,
  type SheetRow,
} from "@/lib/sheets";

const TYPE_ICON: Record<ColumnType, typeof Type> = {
  text: Type,
  number: Hash,
  money: CircleDollarSign,
  date: Calendar,
  select: List,
  checkbox: CheckSquare,
  person: UserRound,
  url: Link2,
};

const PRESENCE_COLORS = ["#2b7fff", "#f2691f", "#10b981", "#8b5cf6", "#e11d48", "#0891b2", "#ca8a04"];
function colorFor(id: string): string {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PRESENCE_COLORS[h % PRESENCE_COLORS.length];
}

type Person = { id: string; name: string };
type Viewer = { id: string; name: string; cell: string | null };
type Pos = { r: number; c: number };

export function SheetGrid({
  sheetId,
  sheetName,
  initialColumns,
  initialRows,
  people,
  me,
}: {
  sheetId: string;
  sheetName: string;
  initialColumns: SheetColumn[];
  initialRows: SheetRow[];
  people: Person[];
  me: Person;
}) {
  const router = useRouter();
  const [cols, setCols] = useState<SheetColumn[]>(initialColumns);
  const [rows, setRows] = useState<SheetRow[]>(initialRows);
  const [sel, setSel] = useState<Pos | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [sort, setSort] = useState<{ col: string; dir: 1 | -1 } | null>(null);
  const [query, setQuery] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [pending, setPending] = useState(0);
  const [error, setError] = useState("");
  const [viewers, setViewers] = useState<Viewer[]>([]);
  const [menu, setMenu] = useState<string | null>(null); // column id whose menu is open, or "new"
  const [menuAt, setMenuAt] = useState({ left: 0, top: 0 });
  const outerRef = useRef<HTMLDivElement>(null);
  const sbRef = useRef<SupabaseClient | null>(null);
  const chRef = useRef<RealtimeChannel | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const peopleMap = useMemo(() => new Map(people.map((p) => [p.id, p.name])), [people]);
  const orderedCols = useMemo(() => [...cols].sort((a, b) => a.position - b.position), [cols]);

  const visibleRows = useMemo(() => {
    let list = [...rows].sort((a, b) => a.position - b.position);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((r) => orderedCols.some((c) => formatCell(c, r.cells[c.id], peopleMap).toLowerCase().includes(q)));
    if (sort) {
      const col = orderedCols.find((c) => c.id === sort.col);
      if (col) list.sort((a, b) => sort.dir * compareCells(col, a.cells[col.id], b.cells[col.id]));
    }
    return list;
  }, [rows, orderedCols, query, sort, peopleMap]);

  // ---------------------------------------------------------------- data I/O
  const sb = useCallback(async () => {
    if (!sbRef.current) sbRef.current = await getBrowserSupabase();
    return sbRef.current;
  }, []);

  const run = useCallback(async (fn: (s: SupabaseClient) => PromiseLike<{ error: { message: string } | null }>) => {
    setPending((n) => n + 1);
    try {
      const { error: e } = await fn(await sb());
      if (e)
        setError(
          e.message.includes("row-level security")
            ? "You don't have edit access to this sheet."
            : /could not find|does not exist|schema cache/i.test(e.message)
              ? "Sheets isn't set up in the database yet."
              : "Couldn't save. Check your connection and try again.",
        );
      else setError("");
    } finally {
      setPending((n) => n - 1);
    }
  }, [sb]);

  const upsertRow = (r: SheetRow) =>
    setRows((list) => (list.some((x) => x.id === r.id) ? list.map((x) => (x.id === r.id ? r : x)) : [...list, r]));
  const upsertCol = (c: SheetColumn) =>
    setCols((list) => (list.some((x) => x.id === c.id) ? list.map((x) => (x.id === c.id ? c : x)) : [...list, c]));

  // live: rows/columns from teammates, plus who is looking at which cell
  useEffect(() => {
    let alive = true;
    let ch: RealtimeChannel | null = null;
    (async () => {
      const s = await sb();
      const { data } = await s.auth.getSession();
      if (data.session?.access_token) s.realtime.setAuth(data.session.access_token);
      if (!alive) return;
      ch = s
        .channel(`sheet:${sheetId}`, { config: { presence: { key: me.id } } })
        .on("postgres_changes", { event: "*", schema: "public", table: "sheet_rows", filter: `sheet_id=eq.${sheetId}` }, (p) => {
          if (p.eventType === "DELETE") setRows((l) => l.filter((x) => x.id !== (p.old as { id: string }).id));
          else upsertRow(p.new as SheetRow);
        })
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "sheet_rows" }, (p) => {
          setRows((l) => l.filter((x) => x.id !== (p.old as { id: string }).id));
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "sheet_columns", filter: `sheet_id=eq.${sheetId}` }, (p) => {
          if (p.eventType === "DELETE") setCols((l) => l.filter((x) => x.id !== (p.old as { id: string }).id));
          else upsertCol(p.new as SheetColumn);
        })
        .on("postgres_changes", { event: "DELETE", schema: "public", table: "sheet_columns" }, (p) => {
          setCols((l) => l.filter((x) => x.id !== (p.old as { id: string }).id));
        })
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "sheets", filter: `id=eq.${sheetId}` }, () => router.refresh())
        .on("presence", { event: "sync" }, () => {
          const state = ch!.presenceState<Viewer>();
          const list: Viewer[] = [];
          for (const [key, metas] of Object.entries(state)) if (key !== me.id && metas[0]) list.push({ ...metas[0], id: key });
          setViewers(list);
        })
        .subscribe((status) => {
          if (status === "SUBSCRIBED") ch!.track({ name: me.name, cell: null });
        });
      chRef.current = ch;
    })().catch(() => {});
    return () => {
      alive = false;
      if (ch && sbRef.current) sbRef.current.removeChannel(ch);
    };
  }, [sheetId, me.id, me.name, router, sb]);

  // tell teammates which cell I'm on
  const selRowId = sel ? visibleRows[sel.r]?.id : undefined;
  const selColId = sel ? orderedCols[sel.c]?.id : undefined;
  useEffect(() => {
    const t = setTimeout(() => {
      chRef.current?.track({ name: me.name, cell: selRowId && selColId ? `${selRowId}:${selColId}` : null });
    }, 150);
    return () => clearTimeout(t);
  }, [selRowId, selColId, me.name]);

  const setCell = useCallback(
    (row: SheetRow, col: SheetColumn, value: CellValue) => {
      const cells = { ...row.cells };
      if (value === null) delete cells[col.id];
      else cells[col.id] = value;
      upsertRow({ ...row, cells });
      run((s) => s.rpc("set_sheet_cell", { p_row: row.id, p_column: col.id, p_value: value }));
    },
    [run],
  );

  const addRow = useCallback(async () => {
    const position = rows.reduce((m, r) => Math.max(m, r.position), 0) + 1;
    setPending((n) => n + 1);
    const s = await sb();
    const { data, error: e } = await s
      .from("sheet_rows")
      .insert({ sheet_id: sheetId, position, cells: {}, created_by: me.id })
      .select("*")
      .single();
    setPending((n) => n - 1);
    if (e || !data) return setError(e?.message ?? "Couldn't add a row");
    upsertRow(data as SheetRow);
    setSort(null);
    setQuery("");
    setTimeout(() => {
      setSel({ r: rows.length, c: 0 });
      wrapRef.current?.focus();
    }, 0);
  }, [rows, sb, sheetId, me.id]);

  const deleteRows = (ids: string[]) => {
    if (!ids.length || !confirm(`Delete ${ids.length} row${ids.length === 1 ? "" : "s"}?`)) return;
    setRows((l) => l.filter((r) => !ids.includes(r.id)));
    setChecked(new Set());
    setSel(null);
    run((s) => s.from("sheet_rows").delete().in("id", ids));
  };

  const addColumn = async (name: string, type: ColumnType, options: SheetColumn["options"]) => {
    const position = cols.reduce((m, c) => Math.max(m, c.position), -1) + 1;
    setPending((n) => n + 1);
    const s = await sb();
    const { data, error: e } = await s
      .from("sheet_columns")
      .insert({ sheet_id: sheetId, name, type, options, position, width: type === "checkbox" ? 110 : 180 })
      .select("*")
      .single();
    setPending((n) => n - 1);
    if (e || !data) return setError(e?.message ?? "Couldn't add the column");
    upsertCol(data as SheetColumn);
  };

  const updateColumn = (col: SheetColumn, patch: Partial<Pick<SheetColumn, "name" | "type" | "options" | "width" | "position">>) => {
    upsertCol({ ...col, ...patch });
    run((s) => s.from("sheet_columns").update(patch).eq("id", col.id));
  };

  const deleteColumn = (col: SheetColumn) => {
    if (!confirm(`Delete the "${col.name}" column and everything in it?`)) return;
    setCols((l) => l.filter((c) => c.id !== col.id));
    setSel(null);
    run((s) => s.from("sheet_columns").delete().eq("id", col.id));
  };

  const moveColumn = (col: SheetColumn, dir: -1 | 1) => {
    const i = orderedCols.findIndex((c) => c.id === col.id);
    const other = orderedCols[i + dir];
    if (!other) return;
    updateColumn(col, { position: other.position });
    updateColumn(other, { position: col.position });
  };

  // ---------------------------------------------------------------- editing
  const current = sel ? { row: visibleRows[sel.r], col: orderedCols[sel.c] } : null;

  const startEdit = (initial?: string) => {
    if (!current?.row || !current.col) return;
    const { row, col } = current;
    if (col.type === "checkbox") return setCell(row, col, !row.cells[col.id]);
    setDraft(initial ?? (col.type === "person" ? String(row.cells[col.id] ?? "") : rawCell(col, row.cells[col.id], peopleMap)));
    setEditing(true);
  };

  const commit = (value?: string, move?: Pos) => {
    if (current?.row && current.col) {
      const { row, col } = current;
      const text = value ?? draft;
      const next: CellValue = col.type === "person" ? (text || null) : parseCell(col.type, text);
      if (next !== (row.cells[col.id] ?? null)) setCell(row, col, next);
    }
    setEditing(false);
    if (move) setSel(move);
    wrapRef.current?.focus();
  };

  const clampMove = (dr: number, dc: number): Pos | null => {
    if (!sel) return null;
    return {
      r: Math.max(0, Math.min(visibleRows.length - 1, sel.r + dr)),
      c: Math.max(0, Math.min(orderedCols.length - 1, sel.c + dc)),
    };
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (editing || menu) return;
    if (!sel) {
      if (e.key.startsWith("Arrow") && visibleRows.length && orderedCols.length) setSel({ r: 0, c: 0 });
      return;
    }
    const k = e.key;
    const mod = e.metaKey || e.ctrlKey;
    if (k === "ArrowUp" || k === "ArrowDown" || k === "ArrowLeft" || k === "ArrowRight") {
      e.preventDefault();
      const d = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[k] as [number, number];
      setSel(clampMove(d[0], d[1]));
    } else if (k === "Tab") {
      e.preventDefault();
      setSel(clampMove(0, e.shiftKey ? -1 : 1));
    } else if (k === "Enter" || k === "F2") {
      e.preventDefault();
      startEdit();
    } else if (k === " " && current?.col?.type === "checkbox") {
      e.preventDefault();
      startEdit();
    } else if ((k === "Backspace" || k === "Delete") && current?.row && current.col) {
      e.preventDefault();
      setCell(current.row, current.col, current.col.type === "checkbox" ? false : null);
    } else if (k === "Escape") {
      setSel(null);
    } else if (mod && k.toLowerCase() === "c" && current?.row && current.col) {
      navigator.clipboard?.writeText(rawCell(current.col, current.row.cells[current.col.id], peopleMap)).catch(() => {});
    } else if (!mod && k.length === 1 && current?.col && !["checkbox", "select", "person", "date"].includes(current.col.type)) {
      e.preventDefault();
      startEdit(k);
    }
  };

  // paste a block from Google Sheets / Excel starting at the selected cell
  const onPaste = async (e: React.ClipboardEvent) => {
    if (editing || !sel) return;
    const text = e.clipboardData.getData("text/plain");
    if (!text) return;
    e.preventDefault();
    const grid = parsePasted(text);
    const nameToId = new Map(people.map((p) => [p.name.toLowerCase(), p.id]));
    const targetRows = [...visibleRows];
    const missing = Math.min(1000, sel.r + grid.length - targetRows.length);
    if (missing > 0) {
      const base = rows.reduce((m, r) => Math.max(m, r.position), 0);
      setPending((n) => n + 1);
      const { data, error: e } = await (await sb())
        .from("sheet_rows")
        .insert(Array.from({ length: missing }, (_, i) => ({ sheet_id: sheetId, position: base + i + 1, cells: {}, created_by: me.id })))
        .select("*");
      setPending((n) => n - 1);
      if (e || !data) return setError("Couldn't add rows for the paste.");
      const added = (data as SheetRow[]).sort((a, b) => a.position - b.position);
      added.forEach(upsertRow);
      targetRows.push(...added);
    }
    grid.forEach((line, i) => {
      const row = targetRows[sel.r + i];
      const cells = { ...row.cells };
      line.forEach((raw, j) => {
        const col = orderedCols[sel.c + j];
        if (!col) return;
        const v = col.type === "person" ? (nameToId.get(raw.trim().toLowerCase()) ?? null) : parseCell(col.type, raw);
        if (v === null) delete cells[col.id];
        else cells[col.id] = v;
      });
      upsertRow({ ...row, cells });
      run((s) => s.from("sheet_rows").update({ cells, updated_by: me.id }).eq("id", row.id));
    });
  };

  const exportCsv = () => {
    const csv = toCsv(orderedCols, visibleRows, peopleMap);
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${sheetName.replace(/[^\w\- ]+/g, "").trim() || "sheet"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // column resize
  const resizing = useRef<{ col: SheetColumn; x: number; w: number } | null>(null);
  useEffect(() => {
    const move = (e: MouseEvent) => {
      const r = resizing.current;
      if (!r) return;
      const w = Math.max(60, Math.min(600, r.w + e.clientX - r.x));
      setCols((l) => l.map((c) => (c.id === r.col.id ? { ...c, width: w } : c)));
    };
    const up = (e: MouseEvent) => {
      const r = resizing.current;
      if (!r) return;
      resizing.current = null;
      const w = Math.max(60, Math.min(600, r.w + e.clientX - r.x));
      run((s) => s.from("sheet_columns").update({ width: Math.round(w) }).eq("id", r.col.id));
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [run]);

  const viewerAt = useMemo(() => {
    const m = new Map<string, Viewer>();
    for (const v of viewers) if (v.cell) m.set(v.cell, v);
    return m;
  }, [viewers]);

  const menuCol = menu && menu !== "new" ? orderedCols.find((c) => c.id === menu) : undefined;
  const totalWidth = 56 + orderedCols.reduce((s, c) => s + c.width, 0) + 48;

  return (
    <div ref={outerRef} className="relative space-y-3">
      {/* toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search this sheet"
            className="h-8 w-56 rounded-lg border border-line bg-surface pl-8 pr-2 text-sm text-ink placeholder:text-ink-faint focus:border-brand-400 focus:outline-none"
          />
        </div>
        <button onClick={() => addRow()} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-gradient-to-b from-brand-400 to-brand-600 px-3 text-xs font-medium text-white shadow-sm hover:from-brand-500 hover:to-brand-700">
          <Plus className="h-3.5 w-3.5" /> Row
        </button>
        <button onClick={() => setMenu(menu === "new" ? null : "new")} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-xs font-medium text-ink hover:bg-fill">
          <Plus className="h-3.5 w-3.5" /> Column
        </button>
        {checked.size > 0 && (
          <button onClick={() => deleteRows([...checked])} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 text-xs font-medium text-rose-600 hover:bg-rose-500/15 dark:text-rose-300">
            <Trash2 className="h-3.5 w-3.5" /> Delete {checked.size}
          </button>
        )}
        {sort && (
          <button onClick={() => setSort(null)} className="inline-flex h-8 items-center gap-1 rounded-lg bg-fill px-2.5 text-xs text-ink-muted hover:text-ink">
            Sorted by {orderedCols.find((c) => c.id === sort.col)?.name} <X className="h-3 w-3" />
          </button>
        )}
        <button onClick={exportCsv} className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-ink-muted hover:bg-fill hover:text-ink">
          <Download className="h-3.5 w-3.5" /> CSV
        </button>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-[11px] text-ink-faint">
            {pending > 0 ? "Saving…" : error ? <span className="text-rose-500">{error}</span> : "All changes saved"}
          </span>
          <div className="flex -space-x-1.5">
            {[{ id: me.id, name: me.name, cell: null }, ...viewers].slice(0, 6).map((v) => (
              <span
                key={v.id}
                title={v.id === me.id ? "You" : `${v.name} is here`}
                className="flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold text-white ring-2 ring-bg"
                style={{ background: colorFor(v.id) }}
              >
                {initials(v.name)}
              </span>
            ))}
          </div>
        </div>
      </div>

      {menuCol && (
        <div className="absolute z-40" style={{ left: menuAt.left, top: menuAt.top }}>
          <ColumnEditor
            key={menuCol.id}
            column={menuCol}
            onClose={() => setMenu(null)}
            onSave={(name, type, options) => {
              const patch: Partial<SheetColumn> = { name, type, options };
              if (type === "select" && menuCol.type !== "select" && !(options.choices ?? []).length) {
                const seen = [...new Set(rows.map((r) => r.cells[menuCol.id]).filter((v) => typeof v === "string" && v))] as string[];
                patch.options = { ...options, choices: seen.slice(0, 30) };
              }
              updateColumn(menuCol, patch);
              setMenu(null);
            }}
            onSort={(dir) => { setSort({ col: menuCol.id, dir }); setMenu(null); }}
            onMove={(dir) => { moveColumn(menuCol, dir); setMenu(null); }}
            onDelete={() => { setMenu(null); deleteColumn(menuCol); }}
          />
        </div>
      )}
      {menu === "new" && <ColumnEditor onClose={() => setMenu(null)} onSave={(n, t, o) => { addColumn(n, t, o); setMenu(null); }} />}

      {/* grid */}
      <div
        ref={wrapRef}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        className="glass relative max-h-[calc(100vh-15rem)] overflow-auto rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30"
      >
        <table className="border-separate border-spacing-0 text-sm" style={{ width: totalWidth, tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: 56 }} />
            {orderedCols.map((c) => (
              <col key={c.id} style={{ width: c.width }} />
            ))}
            <col style={{ width: 48 }} />
          </colgroup>
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 border-b border-r border-line bg-surface px-2 py-2">
                <input
                  type="checkbox"
                  aria-label="Select all rows"
                  className="accent-brand-500"
                  checked={visibleRows.length > 0 && checked.size === visibleRows.length}
                  onChange={(e) => setChecked(e.target.checked ? new Set(visibleRows.map((r) => r.id)) : new Set())}
                />
              </th>
              {orderedCols.map((c) => {
                const Icon = TYPE_ICON[c.type];
                return (
                  <th key={c.id} className="group sticky top-0 z-20 border-b border-r border-line bg-surface p-0 text-left font-medium">
                    <button
                      onClick={(e) => {
                        const b = e.currentTarget.getBoundingClientRect();
                        const o = outerRef.current?.getBoundingClientRect();
                        if (o) setMenuAt({ left: Math.max(0, Math.min(b.left - o.left, o.width - 296)), top: b.bottom - o.top + 4 });
                        setMenu(menu === c.id ? null : c.id);
                      }}
                      className="flex w-full items-center gap-1.5 px-3 py-2 text-xs font-semibold text-ink-muted hover:bg-fill hover:text-ink"
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                      <span className="truncate">{c.name}</span>
                      {sort?.col === c.id && (sort.dir === 1 ? <ArrowDownAZ className="h-3 w-3 text-brand-500" /> : <ArrowUpAZ className="h-3 w-3 text-brand-500" />)}
                      <ChevronDown className="ml-auto h-3 w-3 opacity-0 group-hover:opacity-100" />
                    </button>
                    <span
                      onMouseDown={(e) => {
                        e.preventDefault();
                        resizing.current = { col: c, x: e.clientX, w: c.width };
                      }}
                      className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-brand-400/50"
                    />
                  </th>
                );
              })}
              <th className="sticky top-0 z-20 border-b border-line bg-surface">
                <button onClick={() => setMenu(menu === "new" ? null : "new")} title="Add column" className="flex w-full items-center justify-center py-2 text-ink-faint hover:text-brand-600">
                  <Plus className="h-4 w-4" />
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((row, r) => (
              <tr key={row.id} className="group/row">
                <td className={cn("sticky left-0 z-10 border-b border-r border-line bg-surface px-2 text-center text-[11px] text-ink-faint", checked.has(row.id) && "bg-brand-500/10")}>
                  <span className={cn("group-hover/row:hidden", checked.has(row.id) && "hidden")}>{r + 1}</span>
                  <input
                    type="checkbox"
                    aria-label={`Select row ${r + 1}`}
                    className={cn("accent-brand-500 hidden group-hover/row:inline", checked.has(row.id) && "inline")}
                    checked={checked.has(row.id)}
                    onChange={(e) =>
                      setChecked((s) => {
                        const n = new Set(s);
                        if (e.target.checked) n.add(row.id);
                        else n.delete(row.id);
                        return n;
                      })
                    }
                  />
                </td>
                {orderedCols.map((col, c) => {
                  const active = sel?.r === r && sel?.c === c;
                  const v = row.cells[col.id];
                  const other = viewerAt.get(`${row.id}:${col.id}`);
                  return (
                    <td
                      key={col.id}
                      onMouseDown={() => {
                        if (!(active && editing)) {
                          if (editing) commit();
                          setSel({ r, c });
                        }
                      }}
                      onDoubleClick={() => startEdit()}
                      className={cn(
                        "relative h-9 border-b border-r border-line px-0 align-middle",
                        checked.has(row.id) && "bg-brand-500/5",
                        active && "z-[5] outline outline-2 -outline-offset-1 outline-brand-500",
                      )}
                      style={other && !active ? { outline: `2px solid ${colorFor(other.id)}`, outlineOffset: -1 } : undefined}
                    >
                      {other && !active && (
                        <span className="absolute -top-2 right-0 z-10 rounded px-1 text-[9px] font-semibold text-white" style={{ background: colorFor(other.id) }}>
                          {other.name.split(" ")[0]}
                        </span>
                      )}
                      {active && editing ? (
                        <CellEditor
                          col={col}
                          value={draft}
                          people={people}
                          onChange={setDraft}
                          onCommit={(val, key) => commit(val, key === "Tab" ? clampMove(0, 1) ?? undefined : key === "Enter" ? clampMove(1, 0) ?? undefined : undefined)}
                          onCancel={() => { setEditing(false); wrapRef.current?.focus(); }}
                        />
                      ) : (
                        <CellView col={col} value={v} peopleMap={peopleMap} onToggle={() => setCell(row, col, !v)} />
                      )}
                    </td>
                  );
                })}
                <td className="border-b border-line" />
              </tr>
            ))}
            <tr>
              <td className="sticky left-0 border-r border-line bg-surface" />
              <td colSpan={orderedCols.length + 1} className="p-0">
                <button onClick={() => addRow()} className="flex w-full items-center gap-1.5 px-3 py-2 text-xs text-ink-faint hover:bg-fill hover:text-brand-600">
                  <Plus className="h-3.5 w-3.5" /> New row
                </button>
              </td>
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <td className="sticky bottom-0 left-0 z-20 border-t border-r border-line bg-surface px-2 py-1.5 text-center text-[10px] font-semibold text-ink-faint">
                {visibleRows.length}
              </td>
              {orderedCols.map((col) => (
                <td key={col.id} title={summary(col, visibleRows, peopleMap)} className="sticky bottom-0 z-10 truncate border-t border-r border-line bg-surface px-3 py-1.5 text-[11px] text-ink-faint">
                  {summary(col, visibleRows, peopleMap)}
                </td>
              ))}
              <td className="sticky bottom-0 border-t border-line bg-surface" />
            </tr>
          </tfoot>
        </table>
        {orderedCols.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-ink-faint">No columns yet. Add one with “+ Column”.</p>
        )}
      </div>
      <p className="text-[11px] text-ink-faint">
        Tip: click a cell and start typing. Enter to edit, Tab or arrows to move, Delete to clear. Paste a block straight from Google Sheets or Excel.
      </p>
    </div>
  );
}

function summary(col: SheetColumn, rows: SheetRow[], people: Map<string, string>): string {
  const vals = rows.map((r) => r.cells[col.id]).filter((v) => v !== null && v !== undefined && v !== "");
  if (col.type === "number" || col.type === "money") {
    const nums = vals.map(Number).filter(Number.isFinite);
    if (!nums.length) return "";
    const sum = nums.reduce((a, b) => a + b, 0);
    return `Sum ${formatCell(col, Math.round(sum * 100) / 100, people)} · Avg ${formatCell(col, Math.round((sum / nums.length) * 100) / 100, people)}`;
  }
  if (col.type === "checkbox") {
    const n = rows.filter((r) => r.cells[col.id]).length;
    return rows.length ? `${n}/${rows.length} ✓ (${Math.round((n / rows.length) * 100)}%)` : "";
  }
  if (col.type === "select") {
    const counts = new Map<string, number>();
    for (const v of vals) counts.set(String(v), (counts.get(String(v)) ?? 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k} ${n}`).join(" · ");
  }
  return vals.length ? `${vals.length} filled` : "";
}

function CellView({
  col,
  value,
  peopleMap,
  onToggle,
}: {
  col: SheetColumn;
  value: CellValue | undefined;
  peopleMap: Map<string, string>;
  onToggle: () => void;
}) {
  const base = "flex h-9 items-center overflow-hidden px-3";
  if (col.type === "checkbox")
    return (
      <div className={cn(base, "justify-center")}>
        <input type="checkbox" checked={Boolean(value)} onChange={onToggle} onMouseDown={(e) => e.stopPropagation()} className="h-4 w-4 accent-brand-500" />
      </div>
    );
  if (value === null || value === undefined || value === "") return <div className={base} />;
  if (col.type === "select")
    return (
      <div className={base}>
        <span className={cn("truncate rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", choiceTone(col, String(value)))}>{String(value)}</span>
      </div>
    );
  if (col.type === "person") {
    const name = peopleMap.get(String(value)) ?? "Former member";
    return (
      <div className={cn(base, "gap-1.5")}>
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white" style={{ background: colorFor(String(value)) }}>
          {initials(name)}
        </span>
        <span className="truncate text-ink">{name}</span>
      </div>
    );
  }
  if (col.type === "url") {
    let host = String(value);
    try {
      host = new URL(String(value)).hostname.replace(/^www\./, "");
    } catch {}
    return (
      <div className={base}>
        <a href={String(value)} target="_blank" rel="noreferrer noopener" onMouseDown={(e) => e.stopPropagation()} className="truncate text-brand-600 hover:underline dark:text-brand-300">
          {host}
        </a>
      </div>
    );
  }
  const numeric = col.type === "number" || col.type === "money";
  return (
    <div className={cn(base, numeric && "justify-end tabular-nums")} title={String(value).length > 30 ? String(value) : undefined}>
      <span className="truncate text-ink">{formatCell(col, value, peopleMap)}</span>
    </div>
  );
}

function CellEditor({
  col,
  value,
  people,
  onChange,
  onCommit,
  onCancel,
}: {
  col: SheetColumn;
  value: string;
  people: Person[];
  onChange: (v: string) => void;
  onCommit: (v?: string, key?: string) => void;
  onCancel: () => void;
}) {
  const cls = "absolute inset-0 h-full w-full bg-surface px-3 text-sm text-ink outline-none";
  const keys = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      onCommit(undefined, e.key);
    } else if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
    e.stopPropagation();
  };
  if (col.type === "select")
    return (
      <select autoFocus className={cls} value={value} onKeyDown={keys} onBlur={() => onCommit()} onChange={(e) => onCommit(e.target.value)}>
        <option value="">—</option>
        {(col.options.choices ?? []).map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    );
  if (col.type === "person")
    return (
      <select autoFocus className={cls} value={value} onKeyDown={keys} onBlur={() => onCommit()} onChange={(e) => onCommit(e.target.value)}>
        <option value="">—</option>
        {people.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
    );
  return (
    <input
      autoFocus
      type={col.type === "date" ? "date" : "text"}
      inputMode={col.type === "number" || col.type === "money" ? "decimal" : undefined}
      className={cn(cls, (col.type === "number" || col.type === "money") && "text-right")}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={keys}
      onBlur={() => onCommit()}
      onFocus={(e) => {
        const el = e.currentTarget;
        if (el.type === "text") el.setSelectionRange(el.value.length, el.value.length);
      }}
    />
  );
}

function ColumnEditor({
  column,
  onSave,
  onClose,
  onSort,
  onMove,
  onDelete,
}: {
  column?: SheetColumn;
  onSave: (name: string, type: ColumnType, options: SheetColumn["options"]) => void;
  onClose: () => void;
  onSort?: (dir: 1 | -1) => void;
  onMove?: (dir: -1 | 1) => void;
  onDelete?: () => void;
}) {
  const [name, setName] = useState(column?.name ?? "");
  const [type, setType] = useState<ColumnType>(column?.type ?? "text");
  const [choices, setChoices] = useState((column?.options.choices ?? []).join(", "));
  const [currency, setCurrency] = useState(column?.options.currency ?? "GBP");
  const save = () => {
    const n = name.trim().slice(0, 80);
    if (!n) return;
    const options: SheetColumn["options"] = {};
    if (type === "select") options.choices = [...new Set(choices.split(/[,\n]/).map((s) => s.trim()).filter(Boolean))].slice(0, 50);
    if (type === "money") options.currency = currency;
    onSave(n, type, options);
  };
  const field = "h-8 w-full rounded-lg border border-line bg-surface px-2 text-sm text-ink focus:border-brand-400 focus:outline-none";
  return (
    <div
      className="glass card-glow w-72 space-y-2.5 rounded-xl p-3 text-left"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") onClose();
        if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA") save();
      }}
    >
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-ink">{column ? "Edit column" : "New column"}</p>
        <button onClick={onClose} aria-label="Close" className="text-ink-faint hover:text-ink"><X className="h-3.5 w-3.5" /></button>
      </div>
      <input autoFocus className={field} value={name} onChange={(e) => setName(e.target.value)} placeholder="Column name" maxLength={80} />
      <div className="grid grid-cols-4 gap-1">
        {COLUMN_TYPES.map((t) => {
          const Icon = TYPE_ICON[t];
          return (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={cn(
                "flex flex-col items-center gap-0.5 rounded-lg border px-1 py-1.5 text-[10px]",
                type === t ? "border-brand-500 bg-brand-500/10 text-brand-700 dark:text-brand-300" : "border-line text-ink-muted hover:bg-fill",
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {COLUMN_TYPE_LABEL[t]}
            </button>
          );
        })}
      </div>
      {type === "select" && (
        <textarea
          className={cn(field, "h-16 py-1.5")}
          value={choices}
          onChange={(e) => setChoices(e.target.value)}
          placeholder="Choices, separated by commas (e.g. To do, Doing, Done)"
        />
      )}
      {type === "money" && (
        <select className={field} value={currency} onChange={(e) => setCurrency(e.target.value)}>
          {SHEET_CURRENCIES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      )}
      <button onClick={save} className="h-8 w-full rounded-lg bg-gradient-to-b from-brand-400 to-brand-600 text-xs font-medium text-white hover:from-brand-500 hover:to-brand-700">
        {column ? "Save" : "Add column"}
      </button>
      {column && (
        <div className="grid grid-cols-2 gap-1 border-t border-line pt-2 text-xs">
          <button onClick={() => onSort?.(1)} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-ink-muted hover:bg-fill hover:text-ink"><ArrowDownAZ className="h-3.5 w-3.5" /> Sort A→Z</button>
          <button onClick={() => onSort?.(-1)} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-ink-muted hover:bg-fill hover:text-ink"><ArrowUpAZ className="h-3.5 w-3.5" /> Sort Z→A</button>
          <button onClick={() => onMove?.(-1)} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-ink-muted hover:bg-fill hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" /> Move left</button>
          <button onClick={() => onMove?.(1)} className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-ink-muted hover:bg-fill hover:text-ink"><ArrowRight className="h-3.5 w-3.5" /> Move right</button>
          <button onClick={onDelete} className="col-span-2 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-rose-600 hover:bg-rose-500/10 dark:text-rose-300"><Trash2 className="h-3.5 w-3.5" /> Delete column</button>
        </div>
      )}
    </div>
  );
}
