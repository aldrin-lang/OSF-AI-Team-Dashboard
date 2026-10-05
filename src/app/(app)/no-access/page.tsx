import { redirect } from "next/navigation";
import { getMyAreas, requireProfile } from "@/lib/auth";
import { homeFor } from "@/lib/areas";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/ui/primitives";

export const metadata = { title: "No access yet · OSF AI Team Dashboard" };

export default async function NoAccessPage() {
  await requireProfile();
  const areas = await getMyAreas();
  if (areas.length) redirect(homeFor(areas));
  return (
    <div className="mx-auto max-w-xl space-y-5">
      <PageHeader title="Welcome" subtitle="Your account is ready" />
      <EmptyState>
        You haven&apos;t been added to a department yet, so there is nothing to show. Ask an admin to add you to your
        department on the Admin page, then refresh.
      </EmptyState>
    </div>
  );
}
