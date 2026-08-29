"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  KanbanSquare,
  Users,
  AlertTriangle,
  BarChart3,
  Settings,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

const MAIN = [
  { href: "/", label: "My Desk", icon: LayoutDashboard, exact: true },
  { href: "/pipeline?type=ai", label: "Pipeline", icon: KanbanSquare, match: "/pipeline" },
  { href: "/clients?type=ai", label: "Clients", icon: Users, match: "/clients" },
  { href: "/concerns", label: "Concerns", icon: AlertTriangle, match: "/concerns" },
  { href: "/reports", label: "Reports", icon: BarChart3, match: "/reports" },
];

function itemClass(active: boolean) {
  return cn(
    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
    active
      ? "bg-brand-500 text-white shadow-sm shadow-brand-500/30"
      : "text-slate-600 hover:bg-slate-100 hover:text-navy-800",
  );
}

export function AppNav({ isManager }: { isManager: boolean }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col px-3">
      <p className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        Operations
      </p>
      <div className="flex flex-col gap-1">
        {MAIN.map((item) => {
          const active = item.exact
            ? pathname === "/"
            : pathname.startsWith(item.match ?? item.href);
          return (
            <Link key={item.label} href={item.href} className={itemClass(active)}>
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </div>

      <p className="px-3 pb-2 pt-5 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        Account
      </p>
      <div className="flex flex-col gap-1">
        {isManager && (
          <Link href="/admin" className={itemClass(pathname.startsWith("/admin"))}>
            <ShieldCheck className="h-4 w-4 shrink-0" />
            Admin
          </Link>
        )}
        <Link href="/settings" className={itemClass(pathname.startsWith("/settings"))}>
          <Settings className="h-4 w-4 shrink-0" />
          Settings
        </Link>
      </div>
    </nav>
  );
}
