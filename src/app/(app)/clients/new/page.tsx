import { requireArea } from "@/lib/auth";
import Link from "next/link";
import { getProfiles, getOptions } from "@/lib/data/queries";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardBody, Input, Label, Select } from "@/components/ui/primitives";
import { createClient } from "../actions";

export const metadata = { title: "New client · OSF AI Team Dashboard" };

export default async function NewClientPage() {
  await requireArea("clients");
  const [profiles, sources, countries] = await Promise.all([
    getProfiles(),
    getOptions("source"),
    getOptions("country"),
  ]);

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="New client"
        subtitle="AI receptionist onboarding"
        actions={
          <Link href="/" className="text-sm text-ink-muted hover:text-ink">
            Cancel
          </Link>
        }
      />
      <Card>
        <CardBody>
          <form action={createClient} className="space-y-4">
            <input type="hidden" name="pipeline" value="ai" />
            <div>
              <Label htmlFor="company_name">Company name *</Label>
              <Input id="company_name" name="company_name" required autoFocus placeholder="e.g. M&D Building & Construction" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="name">Contact name *</Label>
                <Input id="name" name="name" required />
              </div>
              <div>
                <Label htmlFor="contact_email">Contact email</Label>
                <Input id="contact_email" name="contact_email" type="email" />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="manager_id">AI Manager</Label>
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
