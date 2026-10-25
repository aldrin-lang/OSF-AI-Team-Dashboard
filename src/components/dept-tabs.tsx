"use client";

import { usePathname } from "next/navigation";
import { findActive, type DeptMenu } from "@/lib/departments";
import { Tabs } from "@/components/motion/tabs";

/**
 * The sub-tabs of the department the current page belongs to, shown above the page
 * like a sheet's tabs (Accounts: Collections, Payments, then its sheet tabs).
 * Pages outside a department (My desk, Settings, Admin) show nothing.
 */
export function DeptTabs({ menu }: { menu: DeptMenu[] }) {
  const pathname = usePathname();
  const hit = findActive(menu, pathname);
  if (!hit || hit.dept.tabs.length < 2) return null;
  return (
    <div className="mb-5 -mt-1">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-faint">{hit.dept.label}</p>
      <Tabs active={hit.tab.href} items={hit.dept.tabs.map((t) => ({ key: t.href, href: t.href, label: t.label }))} />
    </div>
  );
}
