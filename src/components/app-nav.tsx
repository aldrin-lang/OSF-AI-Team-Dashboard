"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Users,
  KanbanSquare,
  AlertTriangle,
  BarChart3,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Inbox,
  UserSearch,
  MessageCircleHeart,
  Receipt,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Area } from "@/lib/areas";

const MAIN: { href: string; label: string; icon: typeof Inbox; area: Area; match?: string; exact?: boolean }[] = [
  { href: "/leads", label: "Leads", icon: Inbox, area: "leads", match: "/leads" },
  { href: "/", label: "Clients", icon: Users, area: "clients", exact: true },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare, area: "clients", match: "/pipeline" },
  { href: "/concerns", label: "Concerns", icon: AlertTriangle, area: "clients", match: "/concerns" },
  { href: "/check-ins", label: "Check-ins", icon: MessageCircleHeart, area: "checkins", match: "/check-ins" },
  { href: "/payments", label: "Payments", icon: Receipt, area: "payments", match: "/payments" },
  { href: "/candidates", label: "Candidates", icon: UserSearch, area: "candidates", match: "/candidates" },
  { href: "/reports", label: "Reports", icon: BarChart3, area: "reports", match: "/reports" },
];

function itemClass(active: boolean) {
  return cn(
    "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all",
    active
      ? "bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-[0_10px_24px_-10px_rgba(43,127,255,0.65),0_1px_0_0_rgba(255,255,255,0.3)_inset] ring-1 ring-inset ring-white/20"
      : "text-ink-muted hover:bg-fill hover:text-ink",
  );
}

export function AppNav({ isManager, areas }: { isManager: boolean; areas: Area[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col px-3">
      <p className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
        Operations
      </p>
      <div className="flex flex-col gap-1">
        {MAIN.filter((item) => areas.includes(item.area)).map((item) => {
          const active = item.exact
            ? pathname === "/"
            : pathname.startsWith(item.match ?? item.href);
          return (
            <Link key={item.label} href={item.href} className={itemClass(active)}>
              <item.icon className="h-[18px] w-[18px] shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </div>

      <p className="px-3 pb-2 pt-5 text-[10px] font-semibold uppercase tracking-wider text-ink-faint">
        Account
      </p>
      <div className="flex flex-col gap-1">
        <Link href="/my-desk" className={itemClass(pathname.startsWith("/my-desk"))}>
          <LayoutDashboard className="h-[18px] w-[18px] shrink-0" />
          My desk
        </Link>
        {isManager && (
          <Link href="/admin" className={itemClass(pathname.startsWith("/admin"))}>
            <ShieldCheck className="h-[18px] w-[18px] shrink-0" />
            Admin
          </Link>
        )}
        <Link href="/settings" className={itemClass(pathname.startsWith("/settings"))}>
          <Settings className="h-[18px] w-[18px] shrink-0" />
          Settings
        </Link>
      </div>
    </nav>
  );
}
