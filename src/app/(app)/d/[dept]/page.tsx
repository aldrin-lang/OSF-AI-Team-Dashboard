import { notFound, redirect } from "next/navigation";
import { getMyAreas } from "@/lib/auth";
import { buildMenu, isDepartment } from "@/lib/departments";
import { getDeptSheets, getMirrorTabs } from "@/lib/server/mirror";
import { Collections } from "./collections";

/** A department's landing page: Accounts opens on Collections, the others on their first sub-tab. */
export default async function DepartmentPage(props: PageProps<"/d/[dept]">) {
  const { dept } = await props.params;
  if (!isDepartment(dept)) notFound();
  if (dept === "accounts") return <Collections searchParams={await props.searchParams} />;
  const menu = buildMenu(await getMyAreas(), await getMirrorTabs(), await getDeptSheets());
  const first = menu.find((d) => d.key === dept)?.tabs[0];
  if (!first) redirect("/no-access");
  redirect(first.href);
}
