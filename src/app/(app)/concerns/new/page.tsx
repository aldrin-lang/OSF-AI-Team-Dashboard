import Link from "next/link";
import { getServerSupabase } from "@/lib/supabase/server";
import { getProfiles, getOptions } from "@/lib/data/queries";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardBody, Input, Label, Select, Textarea } from "@/components/ui/primitives";
import { CONCERN_SEVERITY } from "@/lib/labels";
import { createConcern } from "../actions";
import type { Client } from "@/lib/types";

export const metadata = { title: "Raise concern · AI Receptionist Ops" };

export default async function NewConcernPage(props: PageProps<"/concerns/new">) {
  const sp = await props.searchParams;
  const preClient = typeof sp.client === "string" ? sp.client : "";

  const supabase = await getServerSupabase();
  const [{ data: clients }, profiles, types] = await Promise.all([
    supabase.from("clients").select("id, name, pipeline").order("name"),
    getProfiles(),
    getOptions("concern_type"),
  ]);

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="Raise a concern"
        actions={
          <Link href="/concerns" className="text-sm text-neutral-500 hover:text-neutral-900">
            Cancel
          </Link>
        }
      />
      <Card>
        <CardBody>
          <form action={createConcern} className="space-y-4">
            <div>
              <Label htmlFor="client_id">Client *</Label>
              <Select id="client_id" name="client_id" defaultValue={preClient} required>
                <option value="">Select a client…</option>
                {((clients as Pick<Client, "id" | "name" | "pipeline">[]) ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.pipeline.toUpperCase()})
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="title">Title *</Label>
              <Input id="title" name="title" required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="type">Type</Label>
                <Select id="type" name="type" defaultValue="">
                  <option value="">—</option>
                  {types.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="severity">Severity</Label>
                <Select id="severity" name="severity" defaultValue="medium">
                  {Object.entries(CONCERN_SEVERITY).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="owner_id">Owner</Label>
              <Select id="owner_id" name="owner_id" defaultValue="">
                <option value="">Unassigned</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name || p.email}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" name="description" />
            </div>
            <Button type="submit">Raise concern</Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
