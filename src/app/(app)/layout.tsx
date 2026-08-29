import Link from "next/link";
import { Bell } from "lucide-react";
import { requireProfile, hasRole } from "@/lib/auth";
import { getServerSupabase } from "@/lib/supabase/server";
import { getClientsMini } from "@/lib/data/queries";
import { AppNav } from "@/components/app-nav";
import { LogoWordmark } from "@/components/logo";
import { CommandPalette } from "@/components/command-palette";
import { initials } from "@/lib/utils";
import { signOut } from "@/app/login/actions";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const profile = await requireProfile();
  const supabase = await getServerSupabase();

  const [{ count }, clientsMini] = await Promise.all([
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .is("read_at", null),
    getClientsMini(),
  ]);

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r border-white/10 bg-gradient-to-b from-white/[0.06] to-transparent pb-4 backdrop-blur-xl md:flex">
        <div className="flex h-16 items-center border-b border-white/10 px-5">
          <LogoWordmark />
        </div>
        <div className="pt-4">
          <AppNav isManager={hasRole(profile, "manager")} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-white/10 bg-bg/60 px-4 backdrop-blur-xl md:px-8">
          <div className="flex items-center gap-2 md:hidden">
            <LogoWordmark />
          </div>
          <div className="hidden md:block">
            <CommandPalette clients={clientsMini} />
          </div>
          <div className="ml-auto flex items-center gap-4">
            <Link
              href="/notifications"
              className="relative rounded-lg p-2 text-ink-muted hover:bg-white/[0.06] hover:text-ink"
              aria-label="Notifications"
            >
              <Bell className="h-[18px] w-[18px]" />
              {count ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent-500 px-1 text-[10px] font-semibold text-white">
                  {count > 9 ? "9+" : count}
                </span>
              ) : null}
            </Link>
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-xs font-semibold text-white ring-1 ring-inset ring-white/25 shadow-[0_6px_16px_-6px_rgba(43,127,255,0.7)]">
                {initials(profile.full_name || profile.email)}
              </span>
              <div className="hidden text-right leading-tight sm:block">
                <p className="text-xs font-semibold text-ink">
                  {profile.full_name || profile.email}
                </p>
                <p className="text-[11px] capitalize text-ink-faint">{profile.role}</p>
              </div>
              <form action={signOut}>
                <button className="ml-1 text-xs font-medium text-ink-muted hover:text-ink">
                  Sign out
                </button>
              </form>
            </div>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 md:px-8 md:py-8">{children}</main>
      </div>
    </div>
  );
}
