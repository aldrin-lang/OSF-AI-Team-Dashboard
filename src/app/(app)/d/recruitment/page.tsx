import { redirect } from "next/navigation";

/** Recruitment opens on its first tab (Client requests). */
export default function RecruitmentPage() {
  redirect("/d/recruitment/requests");
}
