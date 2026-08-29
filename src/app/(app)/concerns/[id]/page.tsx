import { notFound } from "next/navigation";
import Link from "next/link";
import { getServerSupabase } from "@/lib/supabase/server";
import { getClientFeed, getProfiles, profileMap } from "@/lib/data/queries";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badge";
import { CONCERN_STATUS, CONCERN_SEVERITY } from "@/lib/labels";
import { formatDate } from "@/lib/utils";
import { Feed } from "@/app/(app)/clients/[id]/feed";
import { ConcernControls } from "./controls";
import type { Concern } from "@/lib/types";

export default async function ConcernDetailPage(props: PageProps<"/concerns/[id]">) {
  const { id } = await props.params;
  const supabase = await getServerSupabase();

  const { data: concern } = await supabase.from("concerns").select("*").eq("id", id).maybeSingle();
  if (!concern) notFound();
  const c = concern as Concern;

  const [{ data: client }, profiles, feed] = await Promise.all([
    supabase.from("clients").select("id, name, pipeline").eq("id", c.client_id).single(),
    getProfiles(),
    getClientFeed(id, "concern"),
  ]);
  const pm = profileMap(profiles);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={c.title}
        subtitle={client ? `${client.name}` : undefined}
        actions={
          <Link href="/concerns" className="text-sm text-neutral-500 hover:text-neutral-900">
            All concerns
          </Link>
        }
      />

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <Badge tone={CONCERN_STATUS[c.status].tone}>{CONCERN_STATUS[c.status].label}</Badge>
        <Badge tone={CONCERN_SEVERITY[c.severity].tone}>{CONCERN_SEVERITY[c.severity].label}</Badge>
        {c.type && <span className="text-neutral-500">{c.type}</span>}
        <span className="text-neutral-400">Raised {formatDate(c.raised_at)}</span>
        {c.raised_by && <span className="text-neutral-400">by {pm.get(c.raised_by)?.full_name ?? "—"}</span>}
      </div>

      {c.description && (
        <Card>
          <CardBody>
            <p className="whitespace-pre-wrap text-sm text-neutral-700">{c.description}</p>
          </CardBody>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Manage</CardTitle>
        </CardHeader>
        <CardBody>
          <ConcernControls
            concern={{
              id: c.id,
              status: c.status,
              severity: c.severity,
              owner_id: c.owner_id,
              resolution: c.resolution,
            }}
            profiles={profiles.map((p) => ({ id: p.id, name: p.full_name || p.email }))}
          />
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Discussion</CardTitle>
        </CardHeader>
        <CardBody>
          <Feed
            entity="concern"
            entityId={id}
            activity={feed.activity}
            comments={feed.comments}
            people={profiles.map((p) => ({ id: p.id, name: p.full_name || p.email }))}
          />
        </CardBody>
      </Card>
    </div>
  );
}
