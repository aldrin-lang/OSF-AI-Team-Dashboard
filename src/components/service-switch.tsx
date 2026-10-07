"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Bot, Layers, UsersRound } from "lucide-react";
import { cn } from "@/lib/utils";
import { SERVICE_COOKIE, SERVICE_INFO, type Service } from "@/lib/service";

const ORDER: Service[] = ["va", "ai", "all"];
const ICON: Record<Service, typeof Bot> = { va: UsersRound, ai: Bot, all: Layers };
// pages that only exist on the VA side
const VA_ONLY = ["/roles", "/candidates", "/vas"];

function saveChoice(s: Service) {
  document.cookie = `${SERVICE_COOKIE}=${s}; path=/; max-age=31536000; samesite=lax`;
  // recolour straight away (violet for VA) while the data reloads
  document.querySelector("[data-service]")?.setAttribute("data-service", s);
}

/** VA Outsourcing · AI Receptionist · All: switches what every page shows. Remembered per browser. */
export function ServiceSwitch({ service }: { service: Service }) {
  const router = useRouter();
  const pathname = usePathname();
  const [picked, setPicked] = useState<Service>(service); // moves instantly; the page catches up
  const [shown, setShown] = useState<Service>(service);
  const [pending, startTransition] = useTransition();
  // follow the server's value when it changes (e.g. another tab switched sides)
  if (shown !== service) {
    setShown(service);
    setPicked(service);
  }

  // soft fade on the page while the new side's data loads
  useEffect(() => {
    const el = document.documentElement;
    if (pending) el.dataset.switching = "1";
    else delete el.dataset.switching;
  }, [pending]);

  const pick = (s: Service) => {
    if (s === picked) return;
    setPicked(s);
    saveChoice(s);
    startTransition(() => {
      if (s === "ai" && VA_ONLY.some((p) => pathname.startsWith(p))) router.push("/");
      router.refresh();
    });
  };

  const index = ORDER.indexOf(picked);
  return (
    <div className="relative mx-3 mb-1 mt-3 grid grid-cols-3 gap-1 rounded-xl bg-fill p-1 collapsed:mx-2 collapsed:grid-cols-1">
      {/* sliding highlight */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-1 left-1 rounded-lg bg-surface shadow-sm ring-1 ring-line transition-transform duration-300 ease-[cubic-bezier(.2,.8,.2,1)] collapsed:hidden"
        style={{ width: "calc((100% - 0.5rem - 0.5rem) / 3)", transform: `translateX(calc(${index} * (100% + 0.25rem)))` }}
      />
      {ORDER.map((s) => {
        const Icon = ICON[s];
        const active = s === picked;
        return (
          <button
            key={s}
            onClick={() => pick(s)}
            title={SERVICE_INFO[s].label}
            aria-pressed={active}
            className={cn(
              "relative z-10 flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-1.5 py-1.5 text-[11px] font-semibold transition-colors duration-200",
              active ? "text-brand-600 dark:text-brand-300" : "text-ink-muted hover:text-ink",
              // collapsed rail has no slider: highlight the button itself
              active && "collapsed:bg-surface collapsed:shadow-sm collapsed:ring-1 collapsed:ring-line",
            )}
          >
            <Icon className={cn("h-3.5 w-3.5 shrink-0 transition-transform duration-300", active && "scale-110")} />
            <span className="collapsed:hidden">{SERVICE_INFO[s].short}</span>
          </button>
        );
      })}
    </div>
  );
}
