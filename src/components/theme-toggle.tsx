"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { THEME_KEY as KEY } from "@/lib/theme";

type Mode = "light" | "dark" | "system";
const NEXT: Record<Mode, Mode> = { light: "dark", dark: "system", system: "light" };
const LABEL: Record<Mode, string> = { light: "Light mode", dark: "Dark mode", system: "Match my device" };

function read(): Mode {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function apply(mode: Mode) {
  const dark = mode === "dark" || (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

const EVENT = "osf-theme-change";
function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** Header button: light → dark → match device. Remembered per browser. */
export function ThemeToggle() {
  const mode = useSyncExternalStore<Mode>(subscribe, read, () => "system");

  useEffect(() => {
    apply(mode);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => read() === "system" && apply("system");
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mode]);

  const cycle = () => {
    const next = NEXT[mode];
    try {
      if (next === "system") localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, next);
    } catch {}
    apply(next);
    window.dispatchEvent(new Event(EVENT));
  };

  const Icon = mode === "dark" ? Moon : mode === "light" ? Sun : Monitor;
  return (
    <button
      onClick={cycle}
      title={`${LABEL[mode]} (click to change)`}
      aria-label={`Theme: ${LABEL[mode]}`}
      className="rounded-lg p-2 text-ink-muted transition-colors hover:bg-fill-strong hover:text-ink"
    >
      <Icon className="h-[18px] w-[18px]" />
    </button>
  );
}

/** Keeps a page in light mode (the login screen artwork is light-only). */
export function ForceLight() {
  useEffect(() => {
    const el = document.documentElement;
    const had = el.classList.contains("dark");
    el.classList.remove("dark");
    return () => {
      if (had) el.classList.add("dark");
    };
  }, []);
  return null;
}
