import { requireArea } from "@/lib/auth";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getServerSupabase } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardBody, Label, Select, Textarea } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badge";
import { SubmitButton } from "@/components/ui/submit-button";
import { Flash, flashFrom } from "@/components/ops/flash";
import { ScoreBadge } from "@/components/ops/score-badge";
import { CANDIDATE_STATUS } from "@/lib/labels";
import { formatDate, relativeTime } from "@/lib/utils";
import { rescreen, sendToTeam, updateCandidate } from "../actions";
import type { Candidate } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-3 py-2 text-sm">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="col-span-2 break-words text-ink">{children}</dd>
    </div>
  );
}

function Points({ items, tone }: { items: string[]; tone: "green" | "amber" }) {
  if (!items.length) return <p className="text-sm text-ink-faint">—</p>;
  return (
    <ul className="space-y-1 text-sm">
      {items.map((t) => (
        <li key={t} className="flex gap-2">
          <span className={tone === "green" ? "text-emerald-600" : "text-accent-600"}>{tone === "green" ? "+" : "!"}</span>
          <span className="text-ink">{t}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function CandidateDetailPage(props: PageProps<"/candidates/[id]">) {
  await requireArea("candidates");
  const { id } = await props.params;
  if (!UUID.test(id)) notFound();
  const msg = flashFrom(await props.searchParams);
  const supabase = await getServerSupabase();
  const { data } = await supabase.from("candidates").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const c = data as Candidate;
  const answers = Object.entries(c.answers ?? {});

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={c.full_name}
        subtitle={[c.applied_role ? `Applied for ${c.applied_role}` : null, `received ${relativeTime(c.created_at)}`]
          .filter(Boolean)
          .join(" · ")}
        actions={
          <Link href="/candidates" className="text-sm text-ink-muted hover:text-ink">
            All candidates
          </Link>
        }
      />
      <Flash msg={msg} />

      <Card glow>
        <CardHeader>
          <CardTitle>AI recommendation</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          {c.ai_recommended_role ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-lg font-semibold text-ink">{c.ai_recommended_role}</span>
                <ScoreBadge score={c.ai_score} />
                {c.ai_alt_roles.map((r) => (
                  <Badge key={r} tone="neutral">
                    also: {r}
                  </Badge>
                ))}
              </div>
              {c.ai_summary && <p className="text-sm text-ink-muted">{c.ai_summary}</p>}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-faint">Strengths</p>
                  <Points items={c.ai_strengths} tone="green" />
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-faint">To check</p>
                  <Points items={c.ai_concerns} tone="amber" />
                </div>
              </div>
            </>
          ) : (
            <p className="text-sm text-ink-faint">Not screened yet.</p>
          )}
          {c.ai_error && <p className="text-sm text-rose-600">Last screening failed: {c.ai_error}</p>}
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <form action={rescreen}>
              <input type="hidden" name="id" value={c.id} />
              <SubmitButton size="sm" variant="secondary" pendingText="Screening…">
                {c.ai_screened_at ? "Re-screen" : "Screen now"}
              </SubmitButton>
            </form>
            <form action={sendToTeam}>
              <input type="hidden" name="id" value={c.id} />
              <SubmitButton size="sm" pendingText="Sending…" disabled={!c.ai_recommended_role}>
                {c.recommendation_sent_at ? "Send to team again" : "Send to team"}
              </SubmitButton>
            </form>
            <span className="text-xs text-ink-faint">
              {c.recommendation_sent_at
                ? `Sent to managers ${relativeTime(c.recommendation_sent_at)}`
                : "Managers get it in-app and by email"}
              {c.ai_screened_at ? ` · screened ${relativeTime(c.ai_screened_at)}` : ""}
            </span>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Decision</CardTitle>
        </CardHeader>
        <CardBody>
          <form action={updateCandidate} className="space-y-3">
            <input type="hidden" name="id" value={c.id} />
            <div className="max-w-xs">
              <Label>Status</Label>
              <Select name="status" defaultValue={c.status}>
                {Object.entries(CANDIDATE_STATUS).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea name="notes" defaultValue={c.notes ?? ""} placeholder="Interview notes, which client, next step…" />
            </div>
            <SubmitButton size="sm" pendingText="Saving…">
              Save
            </SubmitButton>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardBody>
          <dl className="divide-y divide-line">
            <Row label="Email">{c.email ?? "—"}</Row>
            <Row label="Phone">{c.phone ?? "—"}</Row>
            <Row label="Country">{c.country ?? "—"}</Row>
            <Row label="Applied through">{c.source ?? "—"}</Row>
            <Row label="Experience">{c.experience ?? "—"}</Row>
            <Row label="Rate">{c.hourly_rate ?? "—"}</Row>
            <Row label="Availability">{c.availability ?? "—"}</Row>
            <Row label="CV">
              {c.cv_url ? (
                <a href={c.cv_url} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
                  Open CV
                </a>
              ) : (
                "—"
              )}
            </Row>
            {c.portfolio_url && (
              <Row label="Portfolio">
                <a href={c.portfolio_url} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
                  Open portfolio
                </a>
              </Row>
            )}
            <Row label="Received">{formatDate(c.created_at)}</Row>
          </dl>
        </CardBody>
      </Card>

      {answers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Form answers</CardTitle>
          </CardHeader>
          <CardBody>
            <dl className="space-y-3">
              {answers.map(([q, a]) => (
                <div key={q} className="text-sm">
                  <dt className="text-ink-faint">{q}</dt>
                  <dd className="whitespace-pre-wrap break-words text-ink">
                    {String(a).startsWith("[file] ") ? (
                      <a href={String(a).slice(7)} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
                        Open file
                      </a>
                    ) : (
                      String(a)
                    )}
                  </dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
