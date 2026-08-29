import Link from "next/link";
import { Bell } from "lucide-react";
import { requireProfile, hasRole } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { AppNav } from "@/components/app-nav";
import { initials } from "@/lib/utils";
import { signOut } from "@/app/login/actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const profile = await requireProfile();
  const supabase = await getServerSupabase();

  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-60 shrink-0 flex-col border-r border-neutral-200 bg-white py-4 md:flex">
        <div className="px-5 pb-4">
          <p className="text-sm font-semibold text-neutral-900">AI Receptionist Ops</p>
          <p className="text-xs text-neutral-400">Onboarding &amp; operations</p>
        </div>
        <AppNav isManager={hasRole(profile, "manager")} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center justify-between border-b border-neutral-200 bg-white px-4">
          <div className="md:hidden text-sm font-semibold">AI Receptionist Ops</div>
          <div className="ml-auto flex items-center gap-3">
            <Link
              href="/notifications"
              className="relative rounded-md p-2 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" />
              {count ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
                  {count > 9 ? "9+" : count}
                </span>
              ) : null}
            </Link>
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-neutral-200 text-xs font-semibold text-neutral-700">
                {initials(profile.full_name || profile.email)}
              </span>
              <div className="hidden text-right sm:block">
                <p className="text-xs font-medium text-neutral-900">
                  {profile.full_name || profile.email}
                </p>
                <p className="text-[11px] capitalize text-neutral-400">{profile.role}</p>
              </div>
              <form action={signOut}>
                <button className="ml-1 text-xs text-neutral-500 hover:text-neutral-900">
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 md:px-8">{children}</main>
      </div>
    </div>
  );
}
