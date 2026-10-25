/**
 * The menu is organised by department, like the team's Google Sheets. Each
 * department has sub-tabs: dashboard pages that already exist, plus read-only
 * copies of the department's sheet tabs (sheet_mirror, synced every 30 min).
 * A department or sub-tab only shows when the person has its area.
 */
import type { Area } from "@/lib/areas";

export const DEPARTMENT_KEYS = ["today", "marketing", "sales", "recruitment", "interviews", "va-managers", "accounts"] as const;
export type DepartmentKey = (typeof DEPARTMENT_KEYS)[number];

/** `also`: other paths that belong to this tab (e.g. a client's own page under Clients). */
export type DeptPage = { label: string; href: string; area: Area; exact?: boolean; also?: string[] };

export const DEPARTMENTS: Record<DepartmentKey, { label: string; area: Area; pages: DeptPage[] }> = {
  today: {
    label: "Today",
    area: "reports",
    pages: [
      { label: "Reports", href: "/reports", area: "reports", exact: true },
      { label: "Daily report", href: "/reports/daily", area: "reports" },
      { label: "Team numbers", href: "/reports/team", area: "reports" },
    ],
  },
  marketing: {
    label: "Leads & Marketing",
    area: "leads",
    pages: [{ label: "Leads", href: "/leads", area: "leads" }],
  },
  sales: {
    label: "Sales",
    area: "clients",
    pages: [{ label: "Pipeline", href: "/pipeline", area: "clients" }],
  },
  recruitment: {
    label: "Recruitment",
    area: "candidates",
    pages: [
      { label: "Open roles", href: "/roles", area: "candidates" },
      { label: "Candidates", href: "/candidates", area: "candidates" },
    ],
  },
  interviews: {
    label: "Client Interviews",
    area: "clients",
    pages: [],
  },
  "va-managers": {
    label: "VA Managers",
    area: "clients",
    pages: [
      { label: "Clients", href: "/", area: "clients", exact: true, also: ["/clients"] },
      { label: "VAs", href: "/vas", area: "clients" },
      { label: "Check-ins", href: "/check-ins", area: "checkins" },
      { label: "Concerns", href: "/concerns", area: "clients" },
    ],
  },
  accounts: {
    label: "Accounts",
    area: "payments",
    pages: [
      // the dashboard's own invoice tracker (/payments) is left out for now: Maria's real data is in the sheets
      { label: "Collections", href: "/d/accounts", area: "payments", exact: true },
    ],
  },
};

export function isDepartment(v: unknown): v is DepartmentKey {
  return typeof v === "string" && (DEPARTMENT_KEYS as readonly string[]).includes(v);
}

/** One sub-tab as the menu shows it. */
export type DeptTab = { label: string; href: string; exact?: boolean; also?: string[] };
export type DeptMenu = { key: DepartmentKey; label: string; tabs: DeptTab[] };

/** A synced sheet tab, as listed in the menu (no cells). */
export type MirrorTabInfo = { key: string; department: string; label: string; position: number };

/**
 * The menu for one person: their departments, each with the pages they can open
 * followed by the sheet tabs they can read (RLS already filtered those).
 * Sheet tabs follow the built-in pages, in the order set in the sync script.
 */
export function buildMenu(areas: readonly Area[], mirrors: MirrorTabInfo[]): DeptMenu[] {
  return DEPARTMENT_KEYS.map((key) => {
    const d = DEPARTMENTS[key];
    const pages = d.pages.filter((p) => areas.includes(p.area)).map((p) => ({ label: p.label, href: p.href, exact: p.exact, also: p.also }));
    const sheets = mirrors
      .filter((m) => m.department === key)
      .sort((a, b) => a.position - b.position || a.label.localeCompare(b.label))
      .map((m) => ({ label: m.label, href: `/d/${key}/${m.key}` }));
    return { key, label: d.label, tabs: [...pages, ...sheets] };
  }).filter((d) => d.tabs.length > 0);
}

const under = (path: string, base: string) => path === base || path.startsWith(base + "/");

export function tabMatches(tab: DeptTab, pathname: string): boolean {
  if ((tab.also ?? []).some((a) => under(pathname, a))) return true;
  return tab.exact ? pathname === tab.href : under(pathname, tab.href);
}

/** Which department (and sub-tab) the current page belongs to. Longest matching tab wins. */
export function findActive(menu: DeptMenu[], pathname: string): { dept: DeptMenu; tab: DeptTab } | null {
  let best: { dept: DeptMenu; tab: DeptTab } | null = null;
  for (const dept of menu) {
    for (const tab of dept.tabs) {
      if (tabMatches(tab, pathname) && (!best || tab.href.length > best.tab.href.length)) best = { dept, tab };
    }
  }
  return best;
}
