import Link from "next/link";
import { ExternalLink, Search } from "lucide-react";
import { relativeTime } from "@/lib/utils";
import type { MirrorCell, MirrorGrid, MirrorRow } from "@/lib/mirror";

const PAGE_ROWS = 200;
const URL_RE = /^https?:\/\/\S+$/i;

/**
 * A synced Google Sheet tab drawn like the sheet: same columns, widths, colours,
 * bold and merged cells, header rows and first columns frozen while scrolling,
 * row numbers on the left and cell notes on hover. Read-only.
 * The "paper" keeps the sheet's own light colours in dark mode, like a sheet embed.
 */
export function SheetView({ grid, basePath, page, q }: { grid: MirrorGrid; basePath: string; page: number; q: string }) {
  const { meta } = grid;
  const all = grid.rows; // merges point into this list (hidden rows included)
  const rows = all.filter((r) => !r.hidden); // the sheet's hidden rows stay hidden here too
  const colCount = Math.max(meta.col_count, ...rows.map((r) => r.cells.length), 1);
  const frozen = Math.min(meta.frozen_rows, rows.length, 10);
  const head = rows.slice(0, frozen);
  const query = q.trim().toLowerCase();
  const body = rows.slice(frozen).filter((r) => !query || r.cells.some((c) => c.v.toLowerCase().includes(query)));
  const pages = Math.max(1, Math.ceil(body.length / PAGE_ROWS));
  const p = Math.min(Math.max(1, page), pages);
  const shown = body.slice((p - 1) * PAGE_ROWS, p * PAGE_ROWS);

  const widths = Array.from({ length: colCount }, (_, i) => Math.min(Math.max(meta.col_widths[i] ?? 100, 36), 420));
  // freeze the sheet's frozen columns only when they leave room for the rest
  let frozenCols = Math.min(meta.frozen_cols, 3);
  while (frozenCols > 0 && widths.slice(0, frozenCols).reduce((a, b) => a + b, 0) > 380) frozenCols--;
  const GUTTER = 44;
  const lefts = widths.map((_, i) => GUTTER + widths.slice(0, i).reduce((a, b) => a + b, 0));

  // merged cells: only used when no search filter is on (filtered rows no longer sit together)
  const mergeAt = new Map<string, [number, number]>();
  const covered = new Set<string>();
  if (!query) {
    const visible = new Set([...head, ...shown].map((r) => r.num));
    for (const [r0, c0, rs, cs] of meta.merges) {
      const top = all[r0];
      if (!top || !visible.has(top.num)) continue;
      // the merged rows that are on screen, in order (hidden rows inside a merge are skipped)
      const spanned = all.slice(r0, r0 + rs).filter((r) => !r.hidden && visible.has(r.num));
      mergeAt.set(`${top.num}:${c0}`, [Math.max(spanned.length, 1), cs]);
      spanned.forEach((r, k) => {
        for (let j = 0; j < cs; j++) if (k || j) covered.add(`${r.num}:${c0 + j}`);
      });
    }
  }

  const link = (n: number) => {
    const sp = new URLSearchParams();
    if (q) sp.set("q", q);
    if (n > 1) sp.set("page", String(n));
    const s = sp.toString();
    return s ? `${basePath}?${s}` : basePath;
  };

  const renderRow = (r: MirrorRow, isHead: boolean) => (
    <tr key={r.num}>
      <th
        scope="row"
        className="sticky left-0 z-[2] border-b border-r border-[#e2e3e3] bg-[#f8f9fa] px-1 text-center text-[11px] font-normal text-[#5f6368]"
        style={{ width: GUTTER, minWidth: GUTTER }}
      >
        {r.num}
      </th>
      {Array.from({ length: colCount }, (_, c) => {
        const id = `${r.num}:${c}`;
        if (covered.has(id)) return null;
        const span = mergeAt.get(id);
        return (
          <Cell
            key={c}
            cell={r.cells[c]}
            head={isHead}
            rowSpan={span?.[0]}
            colSpan={span?.[1]}
            left={c < frozenCols ? lefts[c] : undefined}
          />
        );
      })}
    </tr>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <form method="get" action={basePath} className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <input
            name="q"
            defaultValue={q}
            placeholder="Search this tab"
            className="h-9 w-64 rounded-lg border border-line bg-surface pl-8 pr-3 text-sm text-ink placeholder:text-ink-faint focus:border-brand-400 focus:outline-none"
          />
        </form>
        <p className="text-sm text-ink-muted">
          {query ? `${body.length} matching row${body.length === 1 ? "" : "s"}` : `${body.length} rows`}
          {pages > 1 && ` · page ${p} of ${pages}`}
        </p>
        <div className="ml-auto flex items-center gap-3 text-sm">
          <span className="text-ink-faint">Updated {relativeTime(meta.synced_at)}</span>
          {meta.source_url && (
            <a href={meta.source_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-brand-600 hover:underline">
              Open in Google Sheets <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
      </div>

      <div className="max-h-[calc(100vh-260px)] min-h-[320px] overflow-auto rounded-xl border border-line bg-white text-[#202124] shadow-sm">
        <table className="border-separate border-spacing-0 text-[13px]" style={{ tableLayout: "fixed", width: GUTTER + widths.reduce((a, b) => a + b, 0) }}>
          <colgroup>
            <col style={{ width: GUTTER }} />
            {widths.map((w, i) => (
              <col key={i} style={{ width: w }} />
            ))}
          </colgroup>
          {head.length > 0 && <thead className="sticky top-0 z-[3]">{head.map((r) => renderRow(r, true))}</thead>}
          <tbody>
            {shown.length ? (
              shown.map((r) => renderRow(r, false))
            ) : (
              <tr>
                <td colSpan={colCount + 1} className="px-4 py-10 text-center text-[#5f6368]">
                  {query ? "No rows match your search." : "This tab is empty."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <nav className="flex flex-wrap items-center gap-1.5 text-sm" aria-label="Pages">
          {p > 1 && (
            <Link href={link(p - 1)} className="rounded-lg border border-line px-3 py-1.5 text-ink-muted hover:bg-fill">
              ← Previous
            </Link>
          )}
          {Array.from({ length: pages }, (_, i) => i + 1)
            .filter((n) => n === 1 || n === pages || Math.abs(n - p) <= 2)
            .map((n, i, arr) => (
              <span key={n} className="flex items-center gap-1.5">
                {i > 0 && n - arr[i - 1] > 1 && <span className="text-ink-faint">…</span>}
                <Link
                  href={link(n)}
                  aria-current={n === p ? "page" : undefined}
                  className={n === p ? "rounded-lg bg-brand-600 px-3 py-1.5 font-semibold text-white" : "rounded-lg border border-line px-3 py-1.5 text-ink-muted hover:bg-fill"}
                >
                  {n}
                </Link>
              </span>
            ))}
          {p < pages && (
            <Link href={link(p + 1)} className="rounded-lg border border-line px-3 py-1.5 text-ink-muted hover:bg-fill">
              Next →
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}

function Cell({ cell, head, rowSpan, colSpan, left }: { cell: MirrorCell | undefined; head: boolean; rowSpan?: number; colSpan?: number; left?: number }) {
  const v = cell?.v ?? "";
  const s = cell?.s;
  const sticky = left !== undefined;
  const style: React.CSSProperties = {
    background: s?.bg ?? (head ? "#f8f9fa" : sticky ? "#ffffff" : undefined),
    color: s?.fg,
    fontWeight: s?.b || head ? 600 : undefined,
    fontStyle: s?.i ? "italic" : undefined,
    textAlign: s?.a === "c" ? "center" : s?.a === "r" ? "right" : undefined,
    left,
  };
  return (
    <td
      rowSpan={rowSpan && rowSpan > 1 ? rowSpan : undefined}
      colSpan={colSpan && colSpan > 1 ? colSpan : undefined}
      title={cell?.n || (v.length > 40 ? v : undefined)}
      className={
        "relative border-b border-r border-[#e2e3e3] px-1.5 py-1 align-top leading-snug [overflow-wrap:anywhere]" +
        (sticky ? " sticky z-[1]" : "") +
        (head ? " align-bottom" : "")
      }
      style={style}
    >
      {URL_RE.test(v) ? (
        <a href={v} target="_blank" rel="noreferrer" className="text-[#1a73e8] underline">
          {v.replace(/^https?:\/\/(www\.)?/, "").slice(0, 40)}
          {v.length > 48 ? "…" : ""}
        </a>
      ) : (
        <span className="whitespace-pre-wrap">{v}</span>
      )}
      {cell?.n && <span className="absolute right-0 top-0 h-0 w-0 border-l-[6px] border-t-[6px] border-l-transparent border-t-[#f9ab00]" aria-label="has a note" />}
    </td>
  );
}
