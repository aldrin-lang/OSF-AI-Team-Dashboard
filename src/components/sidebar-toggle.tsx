"use client";

import { useEffect } from "react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { SIDEBAR_KEY } from "@/lib/theme";

function toggle() {
  const el = document.documentElement;
  const collapsed = el.dataset.sidebar !== "collapsed";
  if (collapsed) el.dataset.sidebar = "collapsed";
  else delete el.dataset.sidebar;
  try {
    localStorage.setItem(SIDEBAR_KEY, collapsed ? "collapsed" : "open");
  } catch {}
}

/** Collapse the sidebar to an icon rail (Cmd/Ctrl + \ also toggles). Remembered per browser. */
export function SidebarToggle() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "\\") {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <button
      onClick={toggle}
      title="Collapse / expand menu (⌘\)"
      aria-label="Collapse or expand the menu"
      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-ink-faint transition-colors hover:bg-fill-strong hover:text-ink"
    >
      <PanelLeftClose className="h-[18px] w-[18px] collapsed:hidden" />
      <PanelLeftOpen className="hidden h-[18px] w-[18px] collapsed:block" />
    </button>
  );
}
