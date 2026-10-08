"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState } from "react";
import { LayoutGroup, motion } from "motion/react";
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
    "group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors duration-200 collapsed:justify-center collapsed:px-0",
    active ? "text-white" : "text-ink-muted hover:bg-fill hover:text-ink",
  );
}

/** The blue highlight glides from the old page's menu item to the new one. */
function ActivePill() {
  return (
    <motion.span
      layoutId="nav-active"
      transition={{ type: "spring", stiffness: 500, damping: 40, mass: 0.8 }}
      className="absolute inset-0 z-0 rounded-xl bg-gradient-to-r from-brand-500 to-brand-600 shadow-[0_10px_24px_-10px_rgba(43,127,255,0.65),0_1px_0_0_rgba(255,255,255,0.3)_inset] ring-1 ring-inset ring-white/20"
    />
  );
}

function NavLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof Inbox; active: boolean }) {
  return (
    <Link href={href} title={label} className={itemClass(active)}>
      {active && <ActivePill />}
      <Icon className="relative z-10 h-[18px] w-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110" />
      <span className="relative z-10 collapsed:hidden">{label}</span>
    </Link>
  );
}

export function AppNav({ isManager, areas, service }: { isManager: boolean; areas: Area[]; service: Service }) {
  const group = useId(); // the desktop rail and the mobile drawer each slide their own highlight
  const actual = usePathname();
  // Move the highlight the moment a menu item is clicked, not when the page arrives.
  const [clicked, setClicked] = useState<{ to: string; from: string } | null>(null);
  const pathname = clicked && clicked.from === actual ? clicked.to : actual;
  const onNavClick = (e: React.MouseEvent) => {
    const a = (e.target as HTMLElement).closest("a");
    const to = a?.getAttribute("href");
    if (to && !e.metaKey && !e.ctrlKey && !e.shiftKey) setClicked({ to, from: actual });
  };

  return (
    <LayoutGroup id={group}>
      <nav className="flex flex-1 flex-col px-3 collapsed:px-2.5" onClickCapture={onNavClick}>
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
              <NavLink key={item.label} href={item.href} label={item.label} icon={item.icon} active={active} />
            );
          })}
        </div>

        <p className="px-3 pb-2 pt-5 text-[10px] font-semibold uppercase tracking-wider text-ink-faint collapsed:mx-2 collapsed:mb-3 collapsed:mt-4 collapsed:h-px collapsed:overflow-hidden collapsed:bg-line collapsed:p-0 collapsed:text-transparent">
          Workspace
        </p>
        <div className="flex flex-col gap-1">
          <NavLink href="/sheets" label="Sheets" icon={SheetIcon} active={pathname.startsWith("/sheets")} />
        </div>

        <p className="px-3 pb-2 pt-5 text-[10px] font-semibold uppercase tracking-wider text-ink-faint collapsed:mx-2 collapsed:mb-3 collapsed:mt-4 collapsed:h-px collapsed:overflow-hidden collapsed:bg-line collapsed:p-0 collapsed:text-transparent">
          Account
        </p>
        <div className="flex flex-col gap-1">
          <NavLink href="/my-desk" label="My desk" icon={LayoutDashboard} active={pathname.startsWith("/my-desk")} />
          {isManager && (
            <NavLink href="/admin" label="Admin" icon={ShieldCheck} active={pathname.startsWith("/admin")} />
          )}
          <NavLink href="/settings" label="Settings" icon={Settings} active={pathname.startsWith("/settings")} />
        </div>
      </nav>
    </LayoutGroup>
  );
}
