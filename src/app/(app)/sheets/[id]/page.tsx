import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Copy, Archive, ArchiveRestore, Share2, Globe2, Lock, Users2, UserRound } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { getProfiles } from "@/lib/data/queries";
import { Flash, flashFrom } from "@/components/ops/flash";
import { Input } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { VISIBILITY_LABEL, type Sheet, type SheetColumn, type SheetRow, type SheetVisibility } from "@/lib/sheets";
import { relativeTime } from "@/lib/utils";
import { SheetGrid } from "./grid";
import { ShareChoice } from "./share-choice";
import { deleteSheet, duplicateSheet, renameSheet, setSheetArchived, shareSheet } from "../actions";

const VIS_ICON: Record<SheetVisibility, typeof Lock> = { private: Lock, everyone: Globe2, departments: Users2, people: UserRound };

export async function generateMetadata(props: PageProps<"/sheets/[id]">) {
  const { id } = await props.params;
  const supabase = await getServerSupabase();
  const { data } = /^[0-9a-f-]{36}$/i.test(id) ? await supabase.from("sheets").select("name").eq("id", id).maybeSingle() : { data: null };
  return { title: `${data?.name ?? "Sheet"} · Sheets` };
}

export default async function SheetPage(props: PageProps<"/sheets/[id]">) {
  const me = await requireProfile();
  const { id } = await props.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const sp = await props.searchParams;
  const msg = flashFrom(sp);
  const supabase = await getServerSupabase();

  const [{ data: sheet }, { data: cols }, { data: rows }, profiles, { data: depts }] = await Promise.all([
    supabase.from("sheets").select("*").eq("id", id).maybeSingle(),
    supabase.from("sheet_columns").select("*").eq("sheet_id", id).order("position"),
    supabase.from("sheet_rows").select("*").eq("sheet_id", id).order("position").limit(5000),
    getProfiles(),
    supabase.from("departments").select("key, name").order("position"),
  ]);
  if (!sheet) notFound();
  const s = sheet as Sheet;
  const canManage = me.role === "admin" || s.created_by === me.id;
  const people = profiles.filter((p) => p.active).map((p) => ({ id: p.id, name: p.full_name || p.email }));
  const owner = profiles.find((p) => p.id === s.created_by);
  const VisIcon = VIS_ICON[s.visibility];
  const shareText =
    s.visibility === "departments"
      ? `Shared with ${s.departments.map((d) => depts?.find((x) => x.key === d)?.name ?? d).join(", ") || "no departments"}`
      : s.visibility === "people"
        ? `Shared with ${s.people.length} ${s.people.length === 1 ? "person" : "people"}`
        : VISIBILITY_LABEL[s.visibility];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href="/sheets" className="inline-flex items-center gap-1 text-xs text-ink-faint hover:text-ink">
            <ChevronLeft className="h-3.5 w-3.5" /> Sheets
          </Link>
          <div className="mt-1 flex items-center gap-2.5">
            <span className="text-2xl">{s.emoji || "📄"}</span>
            {canManage ? (
              <form action={renameSheet} className="min-w-0">
                <input type="hidden" name="id" value={s.id} />
                <input type="hidden" name="description" value={s.description ?? ""} />
                <input
                  name="name"
                  defaultValue={s.name}
                  maxLength={120}
                  aria-label="Sheet name"
                  className="w-full min-w-[12rem] rounded-lg border border-transparent bg-transparent px-1.5 py-0.5 text-xl font-semibold tracking-tight text-ink hover:border-line focus:border-brand-400 focus:bg-surface focus:outline-none"
                />
              </form>
            ) : (
              <h1 className="text-xl font-semibold tracking-tight text-ink">{s.name}</h1>
            )}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 pl-1 text-xs text-ink-faint">
            <span className="inline-flex items-center gap-1"><VisIcon className="h-3 w-3" /> {shareText}</span>
            <span>Owner: {owner ? owner.full_name || owner.email : "—"}</span>
            <span>Updated {relativeTime(s.updated_at)}</span>
            {s.archived && <span className="rounded bg-accent-500/15 px-1.5 text-accent-600">Archived</span>}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canManage && (
            <details className="relative">
              <summary className="inline-flex h-8 cursor-pointer list-none items-center gap-1.5 rounded-lg bg-gradient-to-b from-brand-400 to-brand-600 px-3 text-xs font-medium text-white shadow-sm hover:from-brand-500 hover:to-brand-700">
                <Share2 className="h-3.5 w-3.5" /> Share
              </summary>
              <div className="glass card-glow absolute right-0 z-40 mt-2 w-80 rounded-xl p-4">
                <form action={shareSheet} className="space-y-3">
                  <input type="hidden" name="id" value={s.id} />
                  <p className="text-sm font-semibold text-ink">Who can open and edit this sheet?</p>
                  <ShareChoice
                    initial={s.visibility}
                    departments={(depts ?? []).map((d) => ({ key: d.key as string, name: d.name as string }))}
                    selectedDepartments={s.departments}
                    people={people.filter((p) => p.id !== s.created_by)}
                    selectedPeople={s.people}
                  />
                  <p className="text-[11px] leading-snug text-ink-faint">
                    Anyone it&apos;s shared with can add and edit rows and columns. Only you (and admins) can rename, share or delete it.
                  </p>
                  <SubmitButton size="sm" pendingText="Saving…" className="w-full">Save sharing</SubmitButton>
                </form>
              </div>
            </details>
          )}
          <form action={duplicateSheet}>
            <input type="hidden" name="id" value={s.id} />
            <button className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line bg-surface px-3 text-xs font-medium text-ink hover:bg-fill" title="Make a private copy">
              <Copy className="h-3.5 w-3.5" /> Duplicate
            </button>
          </form>
          {canManage && (
            <form action={setSheetArchived}>
              <input type="hidden" name="id" value={s.id} />
              <input type="hidden" name="archived" value={s.archived ? "false" : "true"} />
              <button className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-medium text-ink-muted hover:bg-fill hover:text-ink">
                {s.archived ? <ArchiveRestore className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                {s.archived ? "Restore" : "Archive"}
              </button>
            </form>
          )}
        </div>
      </div>

      <Flash msg={msg} />

      <SheetGrid
        key={s.id}
        sheetId={s.id}
        sheetName={s.name}
        initialColumns={(cols as SheetColumn[]) ?? []}
        initialRows={(rows as SheetRow[]) ?? []}
        people={people}
        me={{ id: me.id, name: me.full_name || me.email }}
      />

      {canManage && (
        <details className="pt-4">
          <summary className="cursor-pointer text-xs text-ink-faint hover:text-rose-500">Delete this sheet…</summary>
          <form action={deleteSheet} className="mt-2 flex flex-wrap items-center gap-2">
            <input type="hidden" name="id" value={s.id} />
            <Input name="confirm" placeholder="Type DELETE" className="w-40" autoComplete="off" />
            <SubmitButton variant="danger" size="sm" pendingText="Deleting…">Delete forever</SubmitButton>
            <span className="text-xs text-ink-faint">Removes every row for everyone. Archive instead if you might need it.</span>
          </form>
        </details>
      )}
    </div>
  );
}
