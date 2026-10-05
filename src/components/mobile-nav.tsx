"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Menu, X } from "lucide-react";
import { AppNav } from "@/components/app-nav";
import { LogoWordmark } from "@/components/logo";
import type { Area } from "@/lib/areas";

export function MobileNav({ isManager, areas }: { isManager: boolean; areas: Area[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // close on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        className="rounded-lg p-2 text-ink-muted hover:bg-fill hover:text-ink md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="glass absolute inset-y-0 left-0 flex w-72 max-w-[82vw] flex-col rounded-r-2xl">
            <div className="flex h-16 items-center justify-between border-b border-line px-5">
              <LogoWordmark />
              <button
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="rounded-lg p-1.5 text-ink-muted hover:bg-fill hover:text-ink"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-4">
              <AppNav isManager={isManager} areas={areas} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
