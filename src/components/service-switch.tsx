"use client";

import { useRouter, usePathname } from "next/navigation";
import { Bot, Layers, UsersRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { SERVICE_COOKIE, SERVICE_INFO, type Service } from "@/lib/service";

const ICON: Record<Service, typeof Bot> = { va: UsersRound, ai: Bot, all: Layers };
// pages that only exist on the VA side
const VA_ONLY = ["/roles", "/candidates", "/vas"];

/** VA Outsourcing · AI Receptionist · All: switches what every page shows. Remembered per browser. */
export function ServiceSwitch({ service }: { service: Service }) {
  const router = useRouter();
  const pathname = usePathname();
  const pick = (s: Service) => {
    if (s === service) return;
    document.cookie = `${SERVICE_COOKIE}=${s}; path=/; max-age=31536000; samesite=lax`;
    if (s === "ai" && VA_ONLY.some((p) => pathname.startsWith(p))) router.push("/");
    router.refresh();
  };
  return (
    <div className="mx-3 mb-1 mt-3 grid grid-cols-3 gap-1 rounded-xl bg-fill p-1 collapsed:mx-2 collapsed:grid-cols-1">
      {(["va", "ai", "all"] as Service[]).map((s) => {
        const Icon = ICON[s];
        const active = s === service;
        return (
          <button
            key={s}
            onClick={() => pick(s)}
            title={SERVICE_INFO[s].label}
            aria-pressed={active}
            className={cn(
              "flex items-center justify-center gap-1.5 rounded-lg px-1.5 py-1.5 text-[11px] font-semibold transition-all",
              active ? "bg-surface text-brand-600 shadow-sm ring-1 ring-line dark:text-brand-300" : "text-ink-muted hover:text-ink",
            )}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            <span className="collapsed:hidden">{SERVICE_INFO[s].short}</span>
          </button>
        );
      })}
    </div>
  );
}
