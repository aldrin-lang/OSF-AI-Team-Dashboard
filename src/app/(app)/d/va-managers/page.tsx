import { redirect } from "next/navigation";

/** VA Managers opens on its first tab (Clients). */
export default function VaManagersPage() {
  redirect("/");
}
