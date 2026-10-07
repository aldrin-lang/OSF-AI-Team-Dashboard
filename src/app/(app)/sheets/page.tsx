import Link from "next/link";
import { Globe2, Lock, Users2, UserRound, Archive } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { getProfiles } from "@/lib/data/queries";
import { PageHeader } from "@/components/page-header";
import { Flash, flashFrom } from "@/components/ops/flash";
import { Input } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { SHEET_TEMPLATES, VISIBILITY_LABEL, type Sheet, type SheetVisibility } from "@/lib/sheets";
import { relativeTime } from "@/lib/utils";
import { createSheet } from "./actions";

export const metadata = { title: "Sheets · OSF AI Team Dashboard" };

const VIS_ICON: Record<SheetVisibility, typeof Lock> = {
  private: Lock,
  everyone: Globe2,
  departments: Users2,
  people: UserRound,
};

export default async function SheetsPage(props: PageProps<"/sheets">) {
  const me = await requireProfile();
  const sp = await props.searchParams;
  const msg = flashFrom(sp);
  const showArchived = sp.archived === "1";
  const supabase = await getServerSupabase();

  const [{ data }, profiles] = await Promise.all([
    supabase
      .from("sheets")
      .select("*")
      .eq("archived", showArchived)
      .order("updated_at", { ascending: false })
      .limit(200),
    getProfiles(),
  ]);
  const sheets = (data as Sheet[]) ?? [];
  const ids = sheets.map((s) => s.id);
  const { data: rowStats } = ids.length
    ? await supabase.from("sheet_rows").select("sheet_id, updated_at").in("sheet_id", ids).order("updated_at", { ascending: false }).limit(5000)
    : { data: [] as { sheet_id: string; updated_at: string }[] };
  const stats = new Map<string, { rows: number; last: string }>();
  for (const r of rowStats ?? []) {
    const s = stats.get(r.sheet_id);
    if (s) s.rows++;
    else stats.set(r.sheet_id, { rows: 1, last: r.updated_at });
  }
  const name = new Map(profiles.map((p) => [p.id, p.full_name || p.email]));

  const mine = sheets.filter((s) => s.created_by === me.id);
  const shared = sheets.filter((s) => s.created_by !== me.id);

  const grid = (list: Sheet[]) => (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {list.map((s) => {
        const Icon = VIS_ICON[s.visibility];
        const st = stats.get(s.id);
        const last = st && st.last > s.updated_at ? st.last : s.updated_at;
        return (
          <Link
            key={s.id}
            href={`/sheets/${s.id}`}
            className="glass group rounded-2xl p-4 transition-all hover:-translate-y-0.5 hover:border-line-strong"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-fill text-xl">{s.emoji || "📄"}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-ink group-hover:text-brand-600">{s.name}</p>
                <p className="mt-0.5 line-clamp-1 text-xs text-ink-faint">{s.description || "—"}</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-muted">
              <span className="inline-flex items-center gap-1">
                <Icon className="h-3 w-3" />
                {s.visibility === "departments" && s.departments.length
                  ? s.departments.map((d) => d.replace("_", " ")).join(", ")
                  : VISIBILITY_LABEL[s.visibility]}
              </span>
              <span>{st?.rows ?? 0} rows</span>
              <span>edited {relativeTime(last)}</span>
              {s.created_by !== me.id && <span>by {name.get(s.created_by ?? "") ?? "someone"}</span>}
            </div>
          </Link>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sheets"
        subtitle="Your team's trackers, right inside the CRM. Edit together live, share with anyone, export to CSV."
        actions={
          <Link
            href={showArchived ? "/sheets" : "/sheets?archived=1"}
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-medium text-ink-muted hover:bg-fill hover:text-ink"
          >
            <Archive className="h-3.5 w-3.5" />
            {showArchived ? "Back to sheets" : "Archived"}
          </Link>
        }
      />
      <Flash msg={msg} />

      {!showArchived && (
        <section className="glass rounded-2xl p-4 md:p-5">
          <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-ink-muted">New sheet</p>
          <div className="mt-3 grid grid-cols-2 gap-2.5 md:grid-cols-3 xl:grid-cols-6">
            {SHEET_TEMPLATES.map((t) => (
              <form key={t.key} action={createSheet} className="contents">
                <input type="hidden" name="template" value={t.key} />
                <button
                  type="submit"
                  className="group flex flex-col items-start gap-1 rounded-xl border border-line bg-surface p-3 text-left transition-all hover:-translate-y-0.5 hover:border-brand-400 hover:shadow-[0_10px_24px_-14px_rgba(43,127,255,0.6)]"
                >
                  <span className="text-xl">{t.emoji}</span>
                  <span className="text-sm font-semibold text-ink group-hover:text-brand-600">{t.name}</span>
                  <span className="text-[11px] leading-snug text-ink-faint">{t.blurb}</span>
                </button>
              </form>
            ))}
          </div>
          <form action={createSheet} className="mt-3 flex flex-wrap items-center gap-2">
            <input type="hidden" name="template" value="blank" />
            <Input name="name" placeholder="Or name a blank sheet, e.g. Weekly sales huddle" maxLength={120} required className="max-w-sm" />
            <SubmitButton size="sm" pendingText="Creating…">Create</SubmitButton>
          </form>
        </section>
      )}

      {sheets.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line-strong px-4 py-12 text-center text-sm text-ink-faint">
          {showArchived ? "Nothing archived." : "No sheets yet. Pick a template above to start one."}
        </div>
      ) : (
        <>
          {mine.length > 0 && (
            <section className="space-y-2.5">
              <h2 className="text-sm font-semibold text-ink">My sheets</h2>
              {grid(mine)}
            </section>
          )}
          {shared.length > 0 && (
            <section className="space-y-2.5">
              <h2 className="text-sm font-semibold text-ink">Shared with me</h2>
              {grid(shared)}
            </section>
          )}
        </>
      )}
    </div>
  );
}
