import { notFound, redirect } from "next/navigation";
import { getMyAreas } from "@/lib/auth";
import { buildMenu, isDepartment } from "@/lib/departments";
import { getDeptSheets, getMirrorTabs } from "@/lib/server/mirror";

/** A department's landing page opens on its first sub-tab (Accounts has its own pages under /d/accounts). */
export default async function DepartmentPage(props: PageProps<"/d/[dept]">) {
  const { dept } = await props.params;
  if (!isDepartment(dept)) notFound();
  const menu = buildMenu(await getMyAreas(), await getMirrorTabs(), await getDeptSheets());
  const first = menu.find((d) => d.key === dept)?.tabs[0];
  if (!first) redirect("/no-access");
  redirect(first.href);
}
