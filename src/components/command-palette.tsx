"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, CornerDownLeft } from "lucide-react";

type Item = { id: string; name: string; country: string | null; stage: string | null };

export function CommandPalette({ clients }: { clients: Item[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [i, setI] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setI(0);
      setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    const base = s
      ? clients.filter(
          (c) =>
            c.name.toLowerCase().includes(s) ||
            (c.country ?? "").toLowerCase().includes(s),
        )
      : clients;
    return base.slice(0, 8);
  }, [q, clients]);

  function go(item: Item) {
    setOpen(false);
    router.push(`/clients/${item.id}`);
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="hidden items-center gap-2 rounded-lg border border-line bg-fill px-3 py-1.5 text-xs text-ink-faint transition-colors hover:border-line-strong hover:text-ink-muted sm:flex"
      >
        <Search className="h-3.5 w-3.5" />
        Search clients
        <kbd className="rounded border border-line bg-fill-strong px-1 text-[10px]">⌘K</kbd>
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]">
      <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setOpen(false)} />
      <div className="glass relative w-full max-w-lg overflow-hidden rounded-2xl">
        <div className="flex items-center gap-2 border-b border-line px-4">
          <Search className="h-4 w-4 text-ink-faint" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setI(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") setI((n) => Math.min(n + 1, results.length - 1));
              if (e.key === "ArrowUp") setI((n) => Math.max(n - 1, 0));
              if (e.key === "Enter" && results[i]) go(results[i]);
            }}
            placeholder="Search clients by name or country…"
            className="h-12 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-faint"
          />
        </div>
        <ul className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-ink-faint">No matches</li>
          )}
          {results.map((c, idx) => (
            <li key={c.id}>
              <button
                onClick={() => go(c)}
                onMouseEnter={() => setI(idx)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm ${
                  idx === i ? "bg-fill-strong text-ink" : "text-ink-muted"
                }`}
              >
                <span className="flex-1 truncate font-medium">{c.name}</span>
                {c.stage && <span className="text-xs text-ink-faint">{c.stage}</span>}
                {idx === i && <CornerDownLeft className="h-3.5 w-3.5 text-ink-faint" />}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
