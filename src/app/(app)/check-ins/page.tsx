import { getService } from "@/lib/server/service";
import { pipelinesFor } from "@/lib/service";
import Link from "next/link";
import { getServerSupabase } from "@/lib/supabase/server";
import { requireArea, hasRole } from "@/lib/auth";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardBody, Input, Label, Select, Textarea, EmptyState } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { Flash, flashFrom } from "@/components/ops/flash";
import { CHECKIN_MOOD, CHECKIN_STATUS } from "@/lib/labels";
import { dublinDate, nextCheckinDue } from "@/lib/ops-core";
import { formatDate, relativeTime } from "@/lib/utils";
import { aiConfigured } from "@/lib/server/ai";
import { CheckinComposer } from "./composer";
import { checkInNow, closeCheckin, runDueNow, saveReply, updateCadence } from "./actions";
import type { Checkin, Client, VaPlacement } from "@/lib/types";

export const metadata = { title: "Check-ins · OSF AI Team Dashboard" };

const VIEWS = {
  send: "To send",
  waiting: "Awaiting reply",
  attention: "Replies",
  done: "Done",
  schedule: "Schedule",
} as const;
type View = keyof typeof VIEWS;

type Row = Checkin & { clients: { name: string; pipeline: string } | null };

export default async function CheckinsPage(props: PageProps<"/check-ins">) {
  const profile = await requireArea("checkins");
  const sp = await props.searchParams;
  const v = typeof sp.view === "string" ? sp.view : "";
  const view: View = v in VIEWS ? (v as View) : "send";
  const msg = flashFrom(sp);
  const supabase = await getServerSupabase();
  const pipes = pipelinesFor(await getService());

  const [{ data: openRows }, { data: doneRows }] = await Promise.all([
    supabase
      .from("checkins")
      .select("*, clients!inner(name, pipeline)")
      .in("clients.pipeline", pipes)
      .in("status", ["due", "sent", "replied"])
      .order("due_on", { ascending: true })
      .limit(500),
    view === "done"
      ? supabase
          .from("checkins")
          .select("*, clients!inner(name, pipeline)")
          .in("clients.pipeline", pipes)
          .in("status", ["done", "skipped"])
          .order("updated_at", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [] }),
  ]);
  const open = (openRows as Row[]) ?? [];
  const toSend = open.filter((c) => c.status === "due");
  const waiting = open.filter((c) => c.status === "sent");
  const replied = open
    .filter((c) => c.status === "replied")
    .sort((a, b) => (a.mood === "at_risk" ? -1 : 0) - (b.mood === "at_risk" ? -1 : 0));
  const atRisk = replied.filter((c) => c.mood === "at_risk").length;

  const tabs: { key: View; n?: number }[] = [
    { key: "send", n: toSend.length },
    { key: "waiting", n: waiting.length },
    { key: "attention", n: replied.length },
    { key: "done" },
    { key: "schedule" },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Check-ins"
        subtitle="Regular check-ins with clients and placed VAs. Drafted every morning, sent by you."
        actions={
          hasRole(profile, "manager") ? (
            <form action={runDueNow}>
              <SubmitButton size="sm" variant="secondary" pendingText="Checking…">
                Draft due check-ins now
              </SubmitButton>
            </form>
          ) : null
        }
      />
      <Flash msg={msg} />

      <div className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
        {[
          { n: toSend.length, l: "To send" },
          { n: waiting.length, l: "Awaiting reply" },
          { n: replied.length, l: "Replies to review" },
          { n: atRisk, l: "At risk", hot: atRisk > 0 },
        ].map((t) => (
          <div key={t.l} className="glass rounded-2xl px-3 py-3">
            <p className={`text-2xl font-semibold ${t.hot ? "text-rose-600" : "text-ink"}`}>{t.n}</p>
            <p className="text-xs text-ink-faint">{t.l}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 overflow-x-auto border-b border-line text-sm">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={`/check-ins?view=${t.key}`}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 font-medium ${
              view === t.key ? "border-brand-500 text-ink" : "border-transparent text-ink-faint hover:text-ink-muted"
            }`}
          >
            {VIEWS[t.key]}
            {t.n ? <span className="ml-1.5 rounded-full bg-fill px-1.5 text-xs">{t.n}</span> : null}
          </Link>
        ))}
      </div>

      {view === "send" && (
        <List empty="Nothing to send. New check-ins are drafted every morning when they're due.">
          {toSend.map((c) => (
            <Card key={c.id}>
              <CardBody className="space-y-3">
                <Head c={c} />
                <CheckinComposer
                  id={c.id}
                  subject={c.subject ?? ""}
                  message={c.message ?? ""}
                  email={c.contact_email}
                  phone={c.contact_phone}
                />
                <form action={closeCheckin}>
                  <input type="hidden" name="id" value={c.id} />
                  <input type="hidden" name="status" value="skipped" />
                  <input type="hidden" name="view" value="send" />
                  <button className="text-xs text-ink-faint hover:text-ink">Skip this one</button>
                </form>
              </CardBody>
            </Card>
          ))}
        </List>
      )}

      {view === "waiting" && (
        <List empty="No check-ins waiting for a reply.">
          {waiting.map((c) => (
            <Card key={c.id}>
              <CardBody className="space-y-3">
                <Head c={c} />
                <details className="text-sm">
                  <summary className="cursor-pointer text-ink-faint">What we sent</summary>
                  <p className="mt-2 whitespace-pre-wrap text-ink-muted">{c.message}</p>
                </details>
                <ReplyForm id={c.id} view="waiting" />
              </CardBody>
            </Card>
          ))}
        </List>
      )}

      {view === "attention" && (
        <List empty="No replies to review.">
          {replied.map((c) => (
            <Card key={c.id} className={c.mood === "at_risk" ? "ring-1 ring-rose-200" : undefined}>
              <CardBody className="space-y-3">
                <Head c={c} />
                <Analysis c={c} />
                <div className="flex flex-wrap gap-2">
                  <Link href={`/clients/${c.client_id}`} className="text-sm text-brand-600 hover:underline">
                    Open client →
                  </Link>
                  <form action={closeCheckin} className="ml-auto">
                    <input type="hidden" name="id" value={c.id} />
                    <input type="hidden" name="status" value="done" />
                    <input type="hidden" name="view" value="attention" />
                    <SubmitButton size="sm" pendingText="Saving…">
                      Mark done
                    </SubmitButton>
                  </form>
                </div>
              </CardBody>
            </Card>
          ))}
        </List>
      )}

      {view === "done" && (
        <List empty="Nothing completed yet.">
          {((doneRows as Row[]) ?? []).map((c) => (
            <Card key={c.id}>
              <CardBody className="space-y-2">
                <Head c={c} />
                {c.reply ? <Analysis c={c} /> : <p className="text-sm text-ink-faint">No reply recorded.</p>}
              </CardBody>
            </Card>
          ))}
        </List>
      )}

      {view === "schedule" && <Schedule />}

      {!aiConfigured() && view !== "schedule" && (
        <p className="text-xs text-ink-faint">
          AI is not switched on yet (ANTHROPIC_API_KEY): drafts use the standard template and replies are not summarised.
        </p>
      )}
    </div>
  );
}

function List({ empty, children }: { empty: string; children: React.ReactNode[] }) {
  if (!children.length) return <EmptyState>{empty}</EmptyState>;
  return <div className="space-y-4">{children}</div>;
}

function Head({ c }: { c: Row }) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Link href={`/clients/${c.client_id}`} className="font-semibold text-ink hover:underline">
        {c.clients?.name ?? "Client"}
      </Link>
      <Badge tone={c.kind === "va" ? "purple" : "blue"}>
        {c.kind === "va" ? `VA: ${c.contact_name ?? "unnamed"}` : c.clients?.pipeline === "ai" ? "AI client" : "VA client"}
      </Badge>
      <Badge tone={CHECKIN_STATUS[c.status].tone}>{CHECKIN_STATUS[c.status].label}</Badge>
      {c.mood && <Badge tone={CHECKIN_MOOD[c.mood].tone}>{CHECKIN_MOOD[c.mood].label}</Badge>}
      <span className="ml-auto text-xs text-ink-faint">
        {c.sent_at ? `sent ${relativeTime(c.sent_at)} via ${c.channel}` : `due ${formatDate(c.due_on)}`}
        {c.kind === "client" && c.contact_name ? ` · ${c.contact_name}` : ""}
      </span>
    </div>
  );
}

function Analysis({ c }: { c: Row }) {
  return (
    <div className="space-y-2 text-sm">
      {c.ai_summary && (
        <p className="text-ink">
          <span className="text-ink-faint">AI summary: </span>
          {c.ai_summary}
        </p>
      )}
      {c.follow_up && (
        <p className="text-ink">
          <span className="text-ink-faint">Next step: </span>
          {c.follow_up}
        </p>
      )}
      <details>
        <summary className="cursor-pointer text-ink-faint">Their reply</summary>
        <p className="mt-2 whitespace-pre-wrap text-ink-muted">{c.reply}</p>
      </details>
    </div>
  );
}

function ReplyForm({ id, view }: { id: string; view: string }) {
  return (
    <form action={saveReply} className="space-y-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="view" value={view} />
      <Label>Their reply (paste from email or WhatsApp)</Label>
      <Textarea name="reply" rows={4} placeholder="Paste the reply here. The AI reads it, sets the mood and suggests a next step." />
      <div className="flex flex-wrap items-center gap-2">
        <Select name="mood" defaultValue="" className="w-48">
          <option value="">Mood: let AI decide</option>
          <option value="good">Happy</option>
          <option value="neutral">Neutral</option>
          <option value="at_risk">At risk</option>
        </Select>
        <SubmitButton size="sm" pendingText="Reading reply…">
          Save reply
        </SubmitButton>
      </div>
    </form>
  );
}

async function Schedule() {
  const supabase = await getServerSupabase();
  const pipes = pipelinesFor(await getService());
  const today = dublinDate();
  const [{ data: clientRows }, { data: placementRows }, { data: last }] = await Promise.all([
    supabase.from("clients").select("*").in("status", ["active", "live"]).in("pipeline", pipes).order("name"),
    supabase.from("va_placements").select("*, clients!inner(pipeline)").eq("placement_status", "active").in("clients.pipeline", pipes),
    supabase.from("checkins").select("kind, client_id, placement_id, due_on").order("due_on", { ascending: false }).limit(5000),
  ]);
  const clients = (clientRows as Client[]) ?? [];
  const placements = (placementRows as VaPlacement[]) ?? [];
  const lastDue = new Map<string, string>();
  for (const r of last ?? []) {
    const k = `${r.kind}:${r.placement_id ?? r.client_id}`;
    if (!lastDue.has(k)) lastDue.set(k, r.due_on as string);
  }
  const next = (kind: string, subjectId: string, start: string | null, created: string, every: number) =>
    nextCheckinDue({ lastDueOn: lastDue.get(`${kind}:${subjectId}`) ?? null, startDate: start, createdAt: created, everyDays: every });

  if (!clients.length) return <EmptyState>No active or live clients yet.</EmptyState>;
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-muted">
        Every live client gets a check-in on its cadence (onboarding clients start once they go live), and so does each active VA placement (to the VA).
        Missed ones roll into a single check-in. Pause anyone you don&apos;t want checked in on.
      </p>
      {clients.map((c) => {
        const mine = placements.filter((p) => p.client_id === c.id);
        const nextDue = next("client", c.id, c.start_date, c.created_at, c.checkin_every_days);
        return (
          <Card key={c.id}>
            <CardBody className="space-y-3">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <Link href={`/clients/${c.id}`} className="font-semibold text-ink hover:underline">
                  {c.name}
                </Link>
                <span className="text-xs text-ink-faint">{c.contact_email ?? "no email on file"}</span>
                <span className={`ml-auto text-xs ${!c.checkin_paused && nextDue <= today ? "text-accent-600" : "text-ink-faint"}`}>
                  {c.checkin_paused ? "Paused" : `Next: ${formatDate(nextDue)}`}
                </span>
              </div>
              <CadenceForm kind="client" id={c.id} every={c.checkin_every_days} paused={c.checkin_paused} clientId={c.id} />
              {mine.map((p) => (
                <div key={p.id} className="rounded-xl border border-line p-3">
                  <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                    <Badge tone="purple">VA</Badge>
                    <span className="font-medium text-ink">{p.va_name ?? "Unnamed VA"}</span>
                    <span className="text-xs text-ink-faint">{[p.role, p.va_email].filter(Boolean).join(" · ")}</span>
                    <span className="ml-auto text-xs text-ink-faint">
                      {p.checkin_paused
                        ? "Paused"
                        : `Next: ${formatDate(next("va", p.id, c.start_date, p.created_at, p.checkin_every_days))}`}
                    </span>
                  </div>
                  <CadenceForm
                    kind="va"
                    id={p.id}
                    every={p.checkin_every_days}
                    paused={p.checkin_paused}
                    clientId={c.id}
                    vaPhone={p.va_phone ?? ""}
                  />
                </div>
              ))}
            </CardBody>
          </Card>
        );
      })}
    </div>
  );
}

function CadenceForm(props: { kind: "client" | "va"; id: string; every: number; paused: boolean; clientId: string; vaPhone?: string }) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <form action={updateCadence} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="kind" value={props.kind} />
        <input type="hidden" name="id" value={props.id} />
        <div>
          <Label>Every (days)</Label>
          <Input name="every" type="number" min={3} max={90} defaultValue={props.every} className="w-24" />
        </div>
        {props.kind === "va" && (
          <div>
            <Label>VA WhatsApp</Label>
            <Input name="va_phone" defaultValue={props.vaPhone} placeholder="+63…" className="w-40" />
          </div>
        )}
        <label className="flex items-center gap-1.5 pb-2 text-sm text-ink-muted">
          <input type="checkbox" name="paused" defaultChecked={props.paused} /> Paused
        </label>
        <SubmitButton size="sm" variant="secondary" pendingText="Saving…">
          Save
        </SubmitButton>
      </form>
      <form action={checkInNow}>
        <input type="hidden" name="client_id" value={props.clientId} />
        {props.kind === "va" && <input type="hidden" name="placement_id" value={props.id} />}
        <SubmitButton size="sm" variant="ghost" pendingText="Drafting…">
          Check in now
        </SubmitButton>
      </form>
    </div>
  );
}
