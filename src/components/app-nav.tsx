"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useId, useState } from "react";
import { LayoutGroup, motion } from "motion/react";
import {
  Users,
  BarChart3,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  UserSearch,
  Megaphone,
  PhoneCall,
  Mic,
  Wallet,
  Sheet as SheetIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { findActive, type DepartmentKey, type DeptMenu } from "@/lib/departments";
import type { Service } from "@/lib/service";
import { ServiceSwitch } from "@/components/service-switch";

// The menu follows the team's departments (like their Google Sheets); each one opens on
// its first sub-tab and the sub-tabs show above the page (DeptTabs).
const ICON: Record<DepartmentKey, typeof Users> = {
  today: BarChart3,
  marketing: Megaphone,
  sales: PhoneCall,
  recruitment: UserSearch,
  interviews: Mic,
  "va-managers": Users,
  accounts: Wallet,
};

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

function NavLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: typeof Users; active: boolean }) {
  return (
    <Link href={href} title={label} className={itemClass(active)}>
      {active && <ActivePill />}
      <Icon className="relative z-10 h-[18px] w-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110" />
      <span className="relative z-10 collapsed:hidden">{label}</span>
    </Link>
  );
}

export function AppNav({ isManager, menu, service }: { isManager: boolean; menu: DeptMenu[]; service: Service }) {
  const group = useId(); // the desktop rail and the mobile drawer each slide their own highlight
  const actual = usePathname();
  // Move the highlight the moment a menu item is clicked, not when the page arrives.
  const [clicked, setClicked] = useState<{ to: string; from: string } | null>(null);
  const pathname = clicked && clicked.from === actual ? clicked.to : actual;
  const activeDept = findActive(menu, pathname)?.dept.key ?? null;
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
          Departments
        </p>
        <div className="flex flex-col gap-1">
          {menu.map((d) => (
            <NavLink
              key={d.key}
              href={d.tabs[0].href}
              label={d.label}
              icon={ICON[d.key]}
              active={activeDept === d.key}
            />
          ))}
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
