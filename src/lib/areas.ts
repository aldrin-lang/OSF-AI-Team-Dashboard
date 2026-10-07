/** Parts of the dashboard a department can be given (mirrors department_areas.area). */
export const AREAS = ["leads", "clients", "checkins", "candidates", "payments", "reports"] as const;
export type Area = (typeof AREAS)[number];

export const AREA_INFO: Record<Area, { label: string; tabs: string; home: string }> = {
  leads: { label: "Leads", tabs: "Leads", home: "/leads" },
  clients: { label: "Clients", tabs: "Clients, Pipeline, Concerns, VAs (sees Open roles)", home: "/" },
  checkins: { label: "Check-ins", tabs: "Check-ins", home: "/check-ins" },
  candidates: { label: "Candidates", tabs: "Candidates, Open roles", home: "/candidates" },
  payments: { label: "Payments", tabs: "Payments", home: "/payments" },
  reports: { label: "Reports", tabs: "Reports, Daily report", home: "/reports" },
};

export function isArea(v: unknown): v is Area {
  return typeof v === "string" && (AREAS as readonly string[]).includes(v);
}

/** Where to send someone after login: their first area, else the no-access page. */
export function homeFor(areas: readonly Area[]): string {
  const first = AREAS.find((a) => areas.includes(a));
  return first ? AREA_INFO[first].home : "/no-access";
}
