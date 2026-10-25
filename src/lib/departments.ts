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
      // every client's payment records (client_payments); the old test invoice tracker (/payments) is left out
      { label: "All clients", href: "/d/accounts", area: "payments", exact: true, also: ["/d/accounts/client"] },
      { label: "For invoice", href: "/d/accounts/for-invoice", area: "payments" },
      { label: "For collection", href: "/d/accounts/for-collection", area: "payments" },
      { label: "Not paid yet", href: "/d/accounts/not-paid", area: "payments" },
      { label: "Paid", href: "/d/accounts/paid", area: "payments" },
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
/** An editable dashboard Sheet shared with a team department (sheets.visibility = "departments"). */
export type DeptSheetInfo = { id: string; name: string; departments: string[] };

/** Team departments (Admin › departments) → the menu department their shared sheets appear under. */
const SHEET_DEPT: Record<string, DepartmentKey> = {
  accounts: "accounts",
  recruitment: "recruitment",
  sales: "sales",
  marketing: "marketing",
  client_success: "va-managers",
  operations: "va-managers",
};

/**
 * The menu for one person: their departments, each with the pages they can open, then the editable
 * Sheets shared with that department (in the order they were made), then read-only sheet copies.
 * Accounts is CRM records only (client payments), so it never lists sheets.
 * RLS already filtered the sheets and copies to what this person can open.
 */
export function buildMenu(areas: readonly Area[], mirrors: MirrorTabInfo[], sheets: DeptSheetInfo[] = []): DeptMenu[] {
  return DEPARTMENT_KEYS.map((key) => {
    const d = DEPARTMENTS[key];
    const pages = d.pages.filter((p) => areas.includes(p.area)).map((p) => ({ label: p.label, href: p.href, exact: p.exact, also: p.also }));
    const editable = sheets
      .filter((sh) => key !== "accounts" && sh.departments.some((dk) => SHEET_DEPT[dk] === key))
      .map((sh) => ({ label: sh.name, href: `/sheets/${sh.id}` }));
    const copies = mirrors
      .filter((m) => key !== "accounts" && m.department === key)
      .sort((a, b) => a.position - b.position || a.label.localeCompare(b.label))
      .map((m) => ({ label: m.label, href: `/d/${key}/${m.key}` }));
    return { key, label: d.label, tabs: [...pages, ...editable, ...copies] };
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
