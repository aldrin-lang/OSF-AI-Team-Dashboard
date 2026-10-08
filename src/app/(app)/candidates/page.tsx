import Link from "next/link";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireArea } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import { Input, Label, Select, Textarea, EmptyState } from "@/components/ui/primitives";
import { Flash, flashFrom } from "@/components/ops/flash";
import { ScoreBadge } from "@/components/ops/score-badge";
import { CANDIDATE_STATUS } from "@/lib/labels";
import { VA_ROLES, addDays, dublinDate } from "@/lib/ops-core";
import { relativeTime } from "@/lib/utils";
import { aiConfigured } from "@/lib/server/ai";
import { addCandidate } from "./actions";
import type { Candidate } from "@/lib/types";
import { allRows } from "@/lib/server/paged";

export const metadata = { title: "Candidates · OSF AI Team Dashboard" };

const VIEWS = {
  active: { label: "In progress", statuses: ["new", "screened", "shortlisted", "interview"] },
  hired: { label: "Hired", statuses: ["hired"] },
  rejected: { label: "Rejected", statuses: ["rejected"] },
  all: { label: "All", statuses: null },
} as const;

export default async function CandidatesPage(props: PageProps<"/candidates">) {
  await requireArea("candidates");
  const sp = await props.searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const view = (one("view") in VIEWS ? one("view") : "active") as keyof typeof VIEWS;
  const role = (VA_ROLES as readonly string[]).includes(one("role")) ? one("role") : "";
  const term = one("q").replace(/[%,()*]/g, " ").trim().slice(0, 60);
  const msg = flashFrom(sp);

  const supabase = await getServerSupabase();
  let q = supabase.from("candidates").select("*").order("created_at", { ascending: false }).limit(300);
  const statuses = VIEWS[view].statuses;
  if (statuses) q = q.in("status", [...statuses]);
  if (role) q = q.eq("ai_recommended_role", role);
  if (term) q = q.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,applied_role.ilike.%${term}%`);
  const [{ data }, counts] = await Promise.all([
    q,
    allRows((a, b) => supabase.from("candidates").select("status, created_at").order("id").range(a, b)),
  ]);
  const rows = (data as Candidate[]) ?? [];
  const all = counts ?? [];
  const weekAgo = addDays(dublinDate(), -7);

  const href = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ view, role, q: term, ...over })) if (v) p.set(k, v);
    const qs = p.toString();
    return qs ? `/candidates?${qs}` : "/candidates";
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Candidates"
        subtitle="PIT form applicants, screened by AI with a recommended role"
      />
      <Flash msg={msg} />
      {!aiConfigured() && (
        <p className="rounded-xl border border-accent-500/25 bg-accent-500/10 px-4 py-2.5 text-sm text-accent-600">
          AI is not switched on yet (ANTHROPIC_API_KEY). Candidates are matched to a role by keywords until then.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
        {[
          { n: all.filter((c) => c.created_at >= weekAgo).length, l: "Applied this week" },
          { n: all.filter((c) => c.status === "screened" || c.status === "new").length, l: "To review" },
          { n: all.filter((c) => c.status === "shortlisted" || c.status === "interview").length, l: "Shortlisted / interview" },
          { n: all.filter((c) => c.status === "hired").length, l: "Hired" },
        ].map((t) => (
          <div key={t.l} className="glass rounded-2xl px-3 py-3">
            <p className="text-2xl font-semibold text-ink">{t.n}</p>
            <p className="text-xs text-ink-faint">{t.l}</p>
          </div>
        ))}
      </div>

      <details className="glass rounded-2xl">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-ink">+ Add a candidate manually</summary>
        <div className="px-4 pb-4">
            <form action={addCandidate} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label>Full name *</Label>
                <Input name="full_name" required maxLength={200} />
              </div>
              <div>
                <Label>Email</Label>
                <Input name="email" type="email" maxLength={200} />
              </div>
              <div>
                <Label>Phone</Label>
                <Input name="phone" maxLength={40} placeholder="+63…" />
              </div>
              <div>
                <Label>Applied for</Label>
                <Input name="applied_role" maxLength={200} placeholder="e.g. Social Media Manager" />
              </div>
              <div>
                <Label>Experience</Label>
                <Input name="experience" maxLength={200} placeholder="e.g. 3 years, Xero, QuickBooks" />
              </div>
              <div>
                <Label>Hourly rate</Label>
                <Input name="hourly_rate" maxLength={60} placeholder="e.g. $5" />
              </div>
              <div>
                <Label>Availability</Label>
                <Select name="availability" defaultValue="">
                  <option value="">—</option>
                  <option>Full time</option>
                  <option>Part time</option>
                </Select>
              </div>
              <div>
                <Label>CV link</Label>
                <Input name="cv_url" type="url" maxLength={500} placeholder="https://…" />
              </div>
              <div className="sm:col-span-2">
                <Label>About the candidate</Label>
                <Textarea name="about" maxLength={4000} placeholder="Paste their answers or your notes. The AI reads this." />
              </div>
              <div className="sm:col-span-2">
                <SubmitButton size="sm" pendingText="Adding and screening…">Add and screen</SubmitButton>
              </div>
            </form>
        </div>
      </details>

      <div className="flex gap-2 border-b border-line text-sm">
        {Object.entries(VIEWS).map(([k, v]) => (
          <Link
            key={k}
            href={href({ view: k })}
            className={`-mb-px border-b-2 px-3 py-2 font-medium ${
              view === k ? "border-brand-500 text-ink" : "border-transparent text-ink-faint hover:text-ink-muted"
            }`}
          >
            {v.label}
          </Link>
        ))}
      </div>

      <form method="get" className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="view" value={view} />
        <Input name="q" defaultValue={term} placeholder="Search name, email, role" className="w-64" />
        <Select name="role" defaultValue={role} className="w-56">
          <option value="">All recommended roles</option>
          {VA_ROLES.map((r) => (
            <option key={r}>{r}</option>
          ))}
        </Select>
        <Button size="sm" variant="secondary" type="submit">
          Filter
        </Button>
      </form>

      {rows.length === 0 ? (
        <EmptyState>
          No candidates here yet. New PIT form submissions appear automatically once the GHL webhook is connected.
        </EmptyState>
      ) : (
        <div className="glass overflow-x-auto rounded-2xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-ink-faint">
                <th className="px-4 py-2.5 font-medium">Applied</th>
                <th className="px-4 py-2.5 font-medium">Candidate</th>
                <th className="px-4 py-2.5 font-medium">AI recommendation</th>
                <th className="hidden px-4 py-2.5 font-medium md:table-cell">Rate · availability</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-line align-top last:border-0 hover:bg-fill">
                  <td className="whitespace-nowrap px-4 py-2.5 text-ink-faint">{relativeTime(c.created_at)}</td>
                  <td className="px-4 py-2.5">
                    <Link href={`/candidates/${c.id}`} className="font-medium text-ink hover:underline">
                      {c.full_name}
                    </Link>
                    <p className="text-xs text-ink-faint">
                      {[c.applied_role ? `Applied: ${c.applied_role}` : null, c.source].filter(Boolean).join(" · ") || "—"}
                    </p>
                  </td>
                  <td className="px-4 py-2.5">
                    {c.ai_recommended_role ? (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-medium text-ink">{c.ai_recommended_role}</span>
                        <ScoreBadge score={c.ai_score} />
                      </div>
                    ) : c.ai_error ? (
                      <span className="text-xs text-rose-600">Screening failed</span>
                    ) : (
                      <span className="text-xs text-ink-faint">Not screened</span>
                    )}
                  </td>
                  <td className="hidden px-4 py-2.5 text-ink-muted md:table-cell">
                    {[c.hourly_rate, c.availability].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge tone={CANDIDATE_STATUS[c.status].tone}>{CANDIDATE_STATUS[c.status].label}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
