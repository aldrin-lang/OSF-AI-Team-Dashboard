import { notFound } from "next/navigation";
import Link from "next/link";
import { requireArea, hasRole } from "@/lib/auth";
import {
  getClientDetail,
  getClientFeed,
  getProfiles,
  getStages,
  getStageGates,
  profileMap,
} from "@/lib/data/queries";
import { ExternalLink } from "lucide-react";
import { checkAllStageGates } from "@/lib/server/gates";
import { portalLinkFor } from "@/lib/constants";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badge";
import { CLIENT_STATUS, RB_STATUS, BUILD_STATUS } from "@/lib/labels";
import { formatDate, daysSince } from "@/lib/utils";
import { ghlLinks } from "@/lib/ghl";
import { StageMover } from "./stage-mover";
import { Checklist } from "./checklist";
import { Feed } from "./feed";
import { ClientEmails } from "./emails";
import { EditClientPanel, LinesEditor, PlacementsEditor } from "./editors";
import { PLACEMENT_STATUS, ROLE_STATUS } from "@/lib/labels";
import { getServerSupabase } from "@/lib/supabase/server";
import type { VaRole } from "@/lib/types";
import { TaskAdder } from "./task-adder";
import { TaskCheckbox } from "@/app/(app)/_components/task-checkbox";

export default async function ClientDetailPage(props: PageProps<"/clients/[id]">) {
  const { id } = await props.params;
  const me = await requireArea("clients");
  const detail = await getClientDetail(id);
  if (!detail) notFound();

  const { client, lines, placements, checklist, tasks, concerns, stage, emails, templates } = detail;
  const isVa = client.pipeline === "va";
  const [profiles, stages, gates, feed, roles] = await Promise.all([
    getProfiles(),
    getStages(client.pipeline),
    getStageGates(),
    getClientFeed(id),
    isVa
      ? getServerSupabase().then((db) => db.from("va_roles").select("*").eq("client_id", id).order("created_at", { ascending: false }).then((r) => (r.data as VaRole[]) ?? []))
      : Promise.resolve([] as VaRole[]),
  ]);
  const pm = profileMap(profiles);
  const peopleNames = Object.fromEntries(profiles.map((p) => [p.id, p.full_name || p.email]));

  // Which target stages are reachable — evaluated in memory, no extra queries.
  const gateMap = checkAllStageGates(stages, gates, checklist);

  const statusMeta = CLIENT_STATUS[client.status];
  const dis = daysSince(client.stage_entered_at);
  const openConcerns = concerns.filter((c) => c.status !== "resolved");

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title={client.company_name || client.name}
        subtitle={
          [
            client.company_name && client.name !== client.company_name ? `Contact: ${client.name}` : null,
            client.industry,
            client.country,
          ]
            .filter(Boolean)
            .join(" · ") || undefined
        }
        actions={
          <div className="flex items-center gap-3">
            <a
              href={portalLinkFor(client)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-sm font-medium text-navy-800 shadow-sm hover:bg-fill"
            >
              Client portal <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <Link href="/" className="text-sm text-ink-muted hover:text-ink">
              Back to clients
            </Link>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={statusMeta.tone}>{statusMeta.label}</Badge>
        <span className="text-sm text-ink-muted">
          Manager: {client.manager_id ? pm.get(client.manager_id)?.full_name ?? "—" : "Unassigned"}
        </span>
        {stage && (
          <span className="text-sm text-ink-muted">
            {dis}d in <strong className="text-ink-muted">{stage.name}</strong>
            {stage.sla_days != null && dis != null && dis > stage.sla_days && (
              <span className="ml-1 text-red-600">(past {stage.sla_days}d SLA)</span>
            )}
          </span>
        )}
      </div>

      <StageMover
        clientId={id}
        currentStageId={client.stage_id}
        stages={stages.map((s) => ({
          id: s.id,
          name: s.name,
          allowed: gateMap.get(s.id)?.allowed ?? true,
          blockedBy: gateMap.get(s.id)?.blockedBy ?? [],
        }))}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{isVa ? "Onboarding checklist" : "Build checklist"}</CardTitle>
            </CardHeader>
            <CardBody className="p-0">
              <Checklist
                clientId={id}
                items={checklist.map((i) => ({
                  id: i.id,
                  key: i.key,
                  label: i.label,
                  status: i.status,
                  completedBy: i.completed_by ? pm.get(i.completed_by)?.full_name ?? null : null,
                  completedAt: i.completed_at,
                }))}
              />
            </CardBody>
          </Card>

          {isVa ? (
          <Card>
            <CardHeader>
              <CardTitle>VAs &amp; open roles</CardTitle>
              <Link href="/roles" className="text-xs font-medium text-brand-600 hover:underline">All roles →</Link>
            </CardHeader>
            <CardBody className="space-y-4">
              {roles.filter((r) => !["filled", "cancelled"].includes(r.status)).map((r) => (
                <Link key={r.id} href={`/roles/${r.id}`} className="flex items-center justify-between rounded-md border border-line p-3 hover:border-line-strong">
                  <span className="text-sm font-medium text-ink">Hiring: {r.headcount > 1 ? `${r.headcount} × ` : ""}{r.title}</span>
                  <Badge tone={ROLE_STATUS[r.status].tone}>{ROLE_STATUS[r.status].label}</Badge>
                </Link>
              ))}
              {placements.length === 0 && roles.length === 0 && (
                <p className="text-sm text-ink-faint">No VAs placed yet. Open a role for this client, or add a placement below.</p>
              )}
              {placements.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-line p-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{p.va_name || "Unnamed VA"}</p>
                    <p className="text-xs text-ink-faint">
                      {[p.role, p.employment_type, p.start_date ? `since ${formatDate(p.start_date)}` : null, p.hourly_rate != null ? `${p.rate_currency} ${Number(p.hourly_rate).toFixed(2)}/h` : null].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <Badge tone={PLACEMENT_STATUS[p.placement_status].tone}>{PLACEMENT_STATUS[p.placement_status].label}</Badge>
                </div>
              ))}
              <PlacementsEditor clientId={id} placements={placements} />
            </CardBody>
          </Card>
          ) : (
          <Card>
              <CardHeader>
                <CardTitle>Phone lines &amp; systems</CardTitle>
              </CardHeader>
              <CardBody className="space-y-4">
                {lines.length === 0 && (
                  <p className="text-sm text-ink-faint">No phone lines added yet.</p>
                )}
                {lines.map((l) => {
                  const g = ghlLinks(l.ghl_location_id);
                  return (
                    <div key={l.id} className="rounded-md border border-line p-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-semibold text-ink">
                          {l.label || l.ai_phone_number || "Line"}
                        </p>
                        <Badge tone={RB_STATUS[l.regulatory_bundle_status].tone}>
                          RB: {RB_STATUS[l.regulatory_bundle_status].label}
                        </Badge>
                      </div>
                      <dl className="mt-2 grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                        <Field label="AI phone #" value={l.ai_phone_number} />
                        <Field label="Twilio subaccount" value={l.twilio_subaccount} />
                        <Field label="Booking system" value={l.booking_system} />
                        <Field label="GHL location" value={l.ghl_location_id} />
                        <div className="col-span-2 flex flex-wrap gap-2 pt-1">
                          {l.dashboard_url && (
                            <a className="text-brand-400 hover:underline" href={l.dashboard_url} target="_blank" rel="noreferrer">
                              Dashboard ↗
                            </a>
                          )}
                          {g && (
                            <>
                              <a className="text-brand-400 hover:underline" href={g.conversations} target="_blank" rel="noreferrer">GHL conversations ↗</a>
                              <a className="text-brand-400 hover:underline" href={g.knowledgeBase} target="_blank" rel="noreferrer">KB ↗</a>
                              <a className="text-brand-400 hover:underline" href={g.voiceAi} target="_blank" rel="noreferrer">Voice AI ↗</a>
                            </>
                          )}
                        </div>
                      </dl>
                      <div className="mt-2 flex flex-wrap gap-2 text-xs">
                        <Badge tone={BUILD_STATUS[l.prompt_status].tone}>Prompt: {BUILD_STATUS[l.prompt_status].label}</Badge>
                        <Badge tone={BUILD_STATUS[l.kb_status].tone}>KB: {BUILD_STATUS[l.kb_status].label}</Badge>
                        <Badge tone={BUILD_STATUS[l.workflow_status].tone}>Workflow: {BUILD_STATUS[l.workflow_status].label}</Badge>
                      </div>
                    </div>
                  );
                })}
                <LinesEditor clientId={id} lines={lines} />
              </CardBody>
          </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Handover &amp; emails</CardTitle>
            </CardHeader>
            <CardBody>
              <ClientEmails
                clientId={id}
                emails={emails}
                templates={templates}
                peopleNames={peopleNames}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Updates</CardTitle>
            </CardHeader>
            <CardBody>
              <Feed
                entity="client"
                entityId={id}
                activity={feed.activity}
                comments={feed.comments}
                people={profiles.map((p) => ({ id: p.id, name: p.full_name || p.email }))}
              />
            </CardBody>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Client details</CardTitle>
            </CardHeader>
            <CardBody>
              <EditClientPanel
                client={client}
                canEditCommercials={hasRole(me, "manager")}
                profiles={profiles.map((p) => ({ id: p.id, name: p.full_name || p.email }))}
              />
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tasks</CardTitle>
            </CardHeader>
            <CardBody className="space-y-3">
              {tasks.length === 0 && <p className="text-sm text-ink-faint">No tasks.</p>}
              <ul className="space-y-1.5">
                {tasks.map((t) => (
                  <li key={t.id} className="flex items-start gap-2 text-sm">
                    <TaskCheckbox id={t.id} status={t.status} clientId={id} />
                    <span className={t.status === "done" ? "text-ink-faint line-through" : ""}>
                      {t.title}
                      {t.due_date && (
                        <span className="ml-1 text-xs text-ink-faint">· {formatDate(t.due_date)}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
              <TaskAdder
                clientId={id}
                profiles={profiles.map((p) => ({ id: p.id, name: p.full_name || p.email }))}
              />
            </CardBody>
          </Card>

          {openConcerns.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Open concerns</CardTitle>
              </CardHeader>
              <CardBody className="space-y-1.5">
                {openConcerns.map((c) => (
                  <Link
                    key={c.id}
                    href={`/concerns/${c.id}`}
                    className="block rounded px-2 py-1 text-sm hover:bg-fill"
                  >
                    {c.title}
                  </Link>
                ))}
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-ink-faint">{label}</dt>
      <dd className="text-ink">{value || "—"}</dd>
    </div>
  );
}
