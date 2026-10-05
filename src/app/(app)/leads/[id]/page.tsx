import { notFound } from "next/navigation";
import Link from "next/link";
import { getServerSupabase } from "@/lib/supabase/server";
import { getProfiles, profileMap } from "@/lib/data/queries";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LEAD_SERVICE, LEAD_STATUS } from "@/lib/labels";
import { ghlContactLink } from "@/lib/ghl";
import { formatDate, relativeTime } from "@/lib/utils";
import { LeadControls } from "./controls";
import { convertLead, refreshExtras, updateLeadAd } from "../actions";
import { refreshLeadExtras } from "@/lib/server/leads";
import { Input, Label } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import type { Lead, LeadEvent } from "@/lib/types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-3 gap-3 py-2 text-sm">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="col-span-2 text-ink">{children}</dd>
    </div>
  );
}

export default async function LeadDetailPage(props: PageProps<"/leads/[id]">) {
  const { id } = await props.params;
  if (!UUID.test(id)) notFound();
  const supabase = await getServerSupabase();

  const { data } = await supabase.from("leads").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  let lead = data as Lead;
  // Intake form + AI call notes live in GHL; refresh the cached copy if it is older than 15 minutes.
  const extras = await refreshLeadExtras(lead);
  if (extras) lead = { ...lead, ...extras };

  const [{ data: setterRows }, { data: eventRows }, profiles] = await Promise.all([
    supabase.from("setters").select("id, name").order("name"),
    supabase.from("lead_events").select("*").eq("lead_id", id).order("created_at", { ascending: false }).limit(100),
    getProfiles(),
  ]);
  const setters = (setterRows as { id: string; name: string }[]) ?? [];
  const events = (eventRows as LeadEvent[]) ?? [];
  const pm = profileMap(profiles);
  const ghlLink = ghlContactLink(process.env.GHL_LOCATION_ID, lead.ghl_contact_id);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={lead.name || lead.email || lead.phone || "Unnamed lead"}
        subtitle={[lead.source, `received ${relativeTime(lead.received_at)}`].filter(Boolean).join(" · ")}
        actions={
          <Link href="/leads" className="text-sm text-ink-muted hover:text-ink">
            All leads
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Badge tone={LEAD_STATUS[lead.status].tone}>{LEAD_STATUS[lead.status].label}</Badge>
        <Badge tone={LEAD_SERVICE[lead.service].tone}>{LEAD_SERVICE[lead.service].label}</Badge>
        {lead.historical && <Badge tone="neutral">History</Badge>}
        {lead.setter_id && (
          <span className="text-ink-muted">Setter: {setters.find((t) => t.id === lead.setter_id)?.name ?? "—"}</span>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Contact</CardTitle>
        </CardHeader>
        <CardBody>
          <dl className="divide-y divide-line">
            <Row label="Phone">
              <span>{lead.phone ?? "—"}</span>
              {lead.phone_flag === "likely_miscoded_353" && (
                <p className="mt-1 text-xs text-accent-600">
                  Looks like a foreign number that GHL prefixed with +353 (the website form drops the &quot;+&quot;).
                  Best guess: <span className="font-medium">{lead.phone_suggested}</span>. Check before calling.
                </p>
              )}
              {lead.phone_flag === "no_country_code" && (
                <p className="mt-1 text-xs text-accent-600">No country code on this number. Check before calling.</p>
              )}
            </Row>
            <Row label="Email">{lead.email ?? "—"}</Row>
            <Row label="Source">{lead.source ?? "—"}</Row>
            <Row label="Country">{lead.country ?? "—"}</Row>
            {lead.va_role && <Row label="VA wanted">{lead.va_role}</Row>}
            {lead.job_description && (
              <Row label="Job description">
                <span className="whitespace-pre-wrap">{lead.job_description}</span>
              </Row>
            )}
            <Row label="Tags">
              {lead.tags.length ? (
                <span className="flex flex-wrap gap-1.5">
                  {lead.tags.map((t) => (
                    <Badge key={t}>{t}</Badge>
                  ))}
                </span>
              ) : (
                "—"
              )}
            </Row>
            <Row label="GHL">
              {ghlLink ? (
                <a href={ghlLink} target="_blank" rel="noreferrer" className="text-brand-600 hover:underline">
                  Open contact in GHL
                </a>
              ) : (
                "—"
              )}
              {lead.ghl_assigned_to && (
                <p className="mt-1 text-xs text-ink-faint">GHL owner id: {lead.ghl_assigned_to}</p>
              )}
            </Row>
            <Row label="First seen">{formatDate(lead.ghl_created_at ?? lead.received_at)}</Row>
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>AI intake form &amp; call notes</CardTitle>
          <form action={refreshExtras}>
            <input type="hidden" name="id" value={lead.id} />
            <SubmitButton size="sm" variant="ghost" pendingText="Refreshing…" disabled={!lead.ghl_contact_id}>
              Refresh from GHL
            </SubmitButton>
          </form>
        </CardHeader>
        <CardBody className="space-y-4">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-faint">Client AI intake form</p>
            <p className="whitespace-pre-wrap text-sm text-ink">{lead.intake_form || "—"}</p>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-ink-faint">AI call notes (Peter)</p>
            <p className="whitespace-pre-wrap text-sm text-ink">{lead.call_notes || "No AI call yet."}</p>
          </div>
          <p className="text-xs text-ink-faint">
            {lead.extras_synced_at ? `Read from GHL ${relativeTime(lead.extras_synced_at)}` : "Not read from GHL yet"}
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ad details (sheet columns)</CardTitle>
        </CardHeader>
        <CardBody>
          <form action={updateLeadAd} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <input type="hidden" name="id" value={lead.id} />
            <div>
              <Label>Name of Ads</Label>
              <Input name="ad_name" defaultValue={lead.ad_name ?? ""} maxLength={200} />
            </div>
            <div>
              <Label>Code</Label>
              <Input name="ad_code" defaultValue={lead.ad_code ?? ""} maxLength={60} placeholder="BOFU-PRA-LM-…" />
            </div>
            <div>
              <Label>Country</Label>
              <Input name="country" defaultValue={lead.country ?? ""} maxLength={60} />
            </div>
            <div>
              <SubmitButton size="sm" variant="secondary" pendingText="Saving…">
                Save
              </SubmitButton>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Manage</CardTitle>
        </CardHeader>
        <CardBody>
          <LeadControls
            key={`${lead.status}-${lead.setter_id ?? ""}`}
            lead={{ id: lead.id, status: lead.status, setter_id: lead.setter_id, notes: lead.notes }}
            setters={setters}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Client</CardTitle>
        </CardHeader>
        <CardBody>
          {lead.client_id ? (
            <Link href={`/clients/${lead.client_id}`} className="text-sm text-brand-600 hover:underline">
              Already converted — open the client
            </Link>
          ) : lead.service === "va" || lead.service === "premium" ? (
            <p className="text-sm text-ink-muted">
              VA onboarding isn&apos;t in the dashboard yet. Set the status to Won and hand over through the VA process.
            </p>
          ) : (
            <form action={convertLead} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="id" value={lead.id} />
              <Button size="sm" type="submit">
                Convert to client
              </Button>
              <p className="text-xs text-ink-faint">
                Creates an AI receptionist client at the first onboarding stage and marks this lead Won.
              </p>
            </form>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>History</CardTitle>
        </CardHeader>
        <CardBody>
          {events.length === 0 ? (
            <p className="text-sm text-ink-faint">No history yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {events.map((e) => (
                <li key={e.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="text-ink">
                    {e.summary}
                    <span className="ml-2 text-xs text-ink-faint">
                      {e.actor_id ? pm.get(e.actor_id)?.full_name || "—" : "system"}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-ink-faint">{relativeTime(e.created_at)}</span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
