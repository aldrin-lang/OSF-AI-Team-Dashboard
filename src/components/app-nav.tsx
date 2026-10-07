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
  Briefcase,
  Contact,
  Sheet as SheetIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Area } from "@/lib/areas";
import type { Service } from "@/lib/service";
import { ServiceSwitch } from "@/components/service-switch";

type Side = Service;
const BOTH: Side[] = ["va", "ai", "all"];
const VA: Side[] = ["va", "all"];
// VA outsourcing is the core (full menu); AI receptionist is the side (just the essentials).
const MAIN: { href: string; label: string; icon: typeof Inbox; area: Area; also?: Area; match?: string; exact?: boolean; sides: Side[] }[] = [
  { href: "/leads", label: "Leads", icon: Inbox, area: "leads", match: "/leads", sides: BOTH },
  { href: "/", label: "Clients", icon: Users, area: "clients", exact: true, sides: BOTH },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare, area: "clients", match: "/pipeline", sides: BOTH },
  { href: "/roles", label: "Open roles", icon: Briefcase, area: "candidates", also: "clients", match: "/roles", sides: VA },
  { href: "/candidates", label: "Candidates", icon: UserSearch, area: "candidates", match: "/candidates", sides: VA },
  { href: "/vas", label: "VAs", icon: Contact, area: "clients", match: "/vas", sides: VA },
  { href: "/check-ins", label: "Check-ins", icon: MessageCircleHeart, area: "checkins", match: "/check-ins", sides: VA },
  { href: "/payments", label: "Payments", icon: Receipt, area: "payments", match: "/payments", sides: BOTH },
  { href: "/concerns", label: "Concerns", icon: AlertTriangle, area: "clients", match: "/concerns", sides: VA },
  { href: "/reports", label: "Reports", icon: BarChart3, area: "reports", match: "/reports", sides: VA },
];

function itemClass(active: boolean) {
  return cn(
    "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all collapsed:justify-center collapsed:px-0",
    active
      ? "bg-gradient-to-r from-brand-500 to-brand-600 text-white shadow-[0_10px_24px_-10px_rgba(43,127,255,0.65),0_1px_0_0_rgba(255,255,255,0.3)_inset] ring-1 ring-inset ring-white/20"
      : "text-ink-muted hover:bg-fill hover:text-ink",
  );
}

export function AppNav({ isManager, areas, service }: { isManager: boolean; areas: Area[]; service: Service }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col px-3 collapsed:px-2.5">
      <ServiceSwitch service={service} />
      <p className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-wider text-ink-faint collapsed:hidden">
        Operations
      </p>
      <div className="flex flex-col gap-1">
        {MAIN.filter((item) => item.sides.includes(service) && (areas.includes(item.area) || (item.also && areas.includes(item.also)))).map((item) => {
          const active = item.exact
            ? pathname === "/"
            : pathname.startsWith(item.match ?? item.href);
          return (
            <Link key={item.label} href={item.href} title={item.label} className={itemClass(active)}>
              <item.icon className="h-[18px] w-[18px] shrink-0" />
              <span className="collapsed:hidden">{item.label}</span>
            </Link>
          );
        })}
      </div>

      <p className="px-3 pb-2 pt-5 text-[10px] font-semibold uppercase tracking-wider text-ink-faint collapsed:mx-2 collapsed:mb-3 collapsed:mt-4 collapsed:h-px collapsed:overflow-hidden collapsed:bg-line collapsed:p-0 collapsed:text-transparent">
        Workspace
      </p>
      <div className="flex flex-col gap-1">
        <Link href="/sheets" title="Sheets" className={itemClass(pathname.startsWith("/sheets"))}>
          <SheetIcon className="h-[18px] w-[18px] shrink-0" />
          <span className="collapsed:hidden">Sheets</span>
        </Link>
      </div>

      <p className="px-3 pb-2 pt-5 text-[10px] font-semibold uppercase tracking-wider text-ink-faint collapsed:mx-2 collapsed:mb-3 collapsed:mt-4 collapsed:h-px collapsed:overflow-hidden collapsed:bg-line collapsed:p-0 collapsed:text-transparent">
        Account
      </p>
      <div className="flex flex-col gap-1">
        <Link href="/my-desk" title="My desk" className={itemClass(pathname.startsWith("/my-desk"))}>
          <LayoutDashboard className="h-[18px] w-[18px] shrink-0" />
          <span className="collapsed:hidden">My desk</span>
        </Link>
        {isManager && (
          <Link href="/admin" title="Admin" className={itemClass(pathname.startsWith("/admin"))}>
            <ShieldCheck className="h-[18px] w-[18px] shrink-0" />
            <span className="collapsed:hidden">Admin</span>
          </Link>
        )}
        <Link href="/settings" title="Settings" className={itemClass(pathname.startsWith("/settings"))}>
          <Settings className="h-[18px] w-[18px] shrink-0" />
          <span className="collapsed:hidden">Settings</span>
        </Link>
      </div>
    </nav>
  );
}
