import { notFound } from "next/navigation";
import { requireArea } from "@/lib/auth";
import { DEPARTMENTS, isDepartment } from "@/lib/departments";
import { isArea } from "@/lib/areas";
import { getMirror } from "@/lib/server/mirror";
import { PageHeader } from "@/components/page-header";
import { SheetView } from "@/components/sheet-view";

export async function generateMetadata(props: PageProps<"/d/[dept]/[tab]">) {
  const { tab } = await props.params;
  return { title: `${tab.replace(/-/g, " ")} · OSF AI Team Dashboard` };
}

/** One department sheet tab, copied read-only from Google Sheets. */
export default async function MirrorTabPage(props: PageProps<"/d/[dept]/[tab]">) {
  const { dept, tab } = await props.params;
  if (!isDepartment(dept) || !/^[a-z0-9-]{1,60}$/.test(tab)) notFound();
  const grid = await getMirror(tab);
  if (!grid || grid.meta.department !== dept || !isArea(grid.meta.area)) notFound();
  await requireArea(grid.meta.area);
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const page = typeof sp.page === "string" ? parseInt(sp.page, 10) || 1 : 1;

  return (
    <div className="space-y-4">
      <PageHeader
        title={grid.meta.label}
        subtitle={`${DEPARTMENTS[dept].label} · from ${grid.meta.source_name || "Google Sheets"} (read-only copy, refreshed every 30 minutes)`}
      />
      <SheetView grid={grid} basePath={`/d/${dept}/${tab}`} page={page} q={q} />
    </div>
  );
}
