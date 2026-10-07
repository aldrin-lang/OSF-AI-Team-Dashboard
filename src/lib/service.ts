/** Which side of the business you're looking at. VA outsourcing is the core; AI receptionist is the side. */
export const SERVICES = ["va", "ai", "all"] as const;
export type Service = (typeof SERVICES)[number];
export const SERVICE_COOKIE = "osf-service";
export const DEFAULT_SERVICE: Service = "va";

export const SERVICE_INFO: Record<Service, { label: string; short: string }> = {
  va: { label: "VA Outsourcing", short: "VA" },
  ai: { label: "AI Receptionist", short: "AI" },
  all: { label: "All services", short: "All" },
};

export const isService = (v: unknown): v is Service => typeof v === "string" && (SERVICES as readonly string[]).includes(v);

/** Client pipelines shown for a service. */
export function pipelinesFor(s: Service): ("ai" | "va")[] {
  return s === "all" ? ["va", "ai"] : [s];
}

/** Lead services shown for a service (unknown leads show on both sides until someone sorts them). */
export function leadServicesFor(s: Service): string[] | null {
  if (s === "ai") return ["ai", "unknown"];
  if (s === "va") return ["va", "premium", "unknown"];
  return null;
}
