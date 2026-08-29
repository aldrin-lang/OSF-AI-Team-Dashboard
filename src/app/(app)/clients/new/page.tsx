import Link from "next/link";
import { getProfiles, getOptions } from "@/lib/data/queries";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardBody, Input, Label, Select } from "@/components/ui/primitives";
import { createClient } from "../actions";
import type { PipelineType } from "@/lib/types";

export const metadata = { title: "New client · AI Receptionist Ops" };

export default async function NewClientPage(props: PageProps<"/clients/new">) {
  const sp = await props.searchParams;
  const pipeline = (sp.type === "va" ? "va" : "ai") as PipelineType;
  const [profiles, sources, countries] = await Promise.all([
    getProfiles(),
    getOptions("source"),
    getOptions("country"),
  ]);

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="New client"
        subtitle={pipeline === "ai" ? "AI receptionist onboarding" : "Virtual assistant onboarding"}
        actions={
          <Link href={`/clients?type=${pipeline}`} className="text-sm text-neutral-500 hover:text-neutral-900">
            Cancel
          </Link>
        }
      />
      <Card>
        <CardBody>
          <form action={createClient} className="space-y-4">
            <input type="hidden" name="pipeline" value={pipeline} />
            <div>
              <Label htmlFor="name">Client name *</Label>
              <Input id="name" name="name" required autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="industry">Industry</Label>
                <Input id="industry" name="industry" />
              </div>
              <div>
                <Label htmlFor="country">Country</Label>
                <Select id="country" name="country" defaultValue="">
                  <option value="">—</option>
                  {countries.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="source">Source</Label>
                <Select id="source" name="source" defaultValue="">
                  <option value="">—</option>
                  {sources.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="closed_by">Closed by</Label>
                <Input id="closed_by" name="closed_by" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="manager_id">{pipeline === "ai" ? "AI Manager" : "VA Manager"}</Label>
                <Select id="manager_id" name="manager_id" defaultValue="">
                  <option value="">—</option>
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name || p.email}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="demo_call_date">Demo call date</Label>
                <Input id="demo_call_date" name="demo_call_date" type="date" />
              </div>
            </div>
            <Button type="submit">Create client</Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
