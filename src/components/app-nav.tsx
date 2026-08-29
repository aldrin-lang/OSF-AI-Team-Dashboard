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

const ITEMS = [
  { href: "/", label: "My Desk", icon: LayoutDashboard, exact: true },
  { href: "/pipeline?type=ai", label: "Pipeline", icon: KanbanSquare, match: "/pipeline" },
  { href: "/clients?type=ai", label: "Clients", icon: Users, match: "/clients" },
  { href: "/concerns", label: "Concerns", icon: AlertTriangle, match: "/concerns" },
  { href: "/reports", label: "Reports", icon: BarChart3, match: "/reports" },
];

export function AppNav({ isManager }: { isManager: boolean }) {
  const pathname = usePathname();

  const isActive = (item: (typeof ITEMS)[number]) =>
    item.exact ? pathname === item.href : pathname.startsWith(item.match ?? item.href);

  return (
    <nav className="flex flex-col gap-0.5 px-2">
      {ITEMS.map((item) => (
        <Link
          key={item.label}
          href={item.href}
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            isActive(item)
              ? "bg-neutral-900 text-white"
              : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
          )}
        >
          <item.icon className="h-4 w-4 shrink-0" />
          {item.label}
        </Link>
      ))}

      <div className="my-2 border-t border-neutral-200" />

      {isManager && (
        <Link
          href="/admin"
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            pathname.startsWith("/admin")
              ? "bg-neutral-900 text-white"
              : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
          )}
        >
          <ShieldCheck className="h-4 w-4 shrink-0" />
          Admin
        </Link>
      )}
      <Link
        href="/settings"
        className={cn(
          "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
          pathname.startsWith("/settings")
            ? "bg-neutral-900 text-white"
            : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900",
        )}
      >
        <Settings className="h-4 w-4 shrink-0" />
        Settings
      </Link>
    </nav>
  );
}
