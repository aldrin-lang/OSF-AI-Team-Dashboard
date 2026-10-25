"use client";

import { useState } from "react";
import { Check, Copy, Mail } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * "Draft email" for one client's unpaid lines: shows the reminder text with copy buttons.
 * Nothing is sent from here; Maria pastes it into Gmail and sends it herself.
 */
export function ReminderDraft({ subject, body }: { subject: string; body: string }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<"subject" | "body" | null>(null);

  const copy = async (what: "subject" | "body") => {
    try {
      await navigator.clipboard.writeText(what === "subject" ? subject : body);
      setCopied(what);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      setCopied(null);
    }
  };

  return (
    <div className="w-full">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold",
          open ? "border-brand-600 bg-brand-600 text-white" : "border-line text-brand-600 hover:bg-fill",
        )}
      >
        <Mail className="h-3.5 w-3.5" /> {open ? "Hide email" : "Draft email"}
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-xl border border-line bg-surface p-3">
          <div className="flex items-start gap-2">
            <p className="min-w-0 flex-1 text-sm font-semibold text-ink">{subject}</p>
            <CopyButton done={copied === "subject"} onClick={() => copy("subject")} label="Copy subject" />
          </div>
          <pre className="whitespace-pre-wrap rounded-lg bg-bg p-3 font-sans text-sm text-ink">{body}</pre>
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-ink-faint">Paste into Gmail and send it yourself. Nothing is sent from the dashboard.</p>
            <CopyButton done={copied === "body"} onClick={() => copy("body")} label="Copy email" />
          </div>
        </div>
      )}
    </div>
  );
}

function CopyButton({ done, onClick, label }: { done: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-line bg-bg px-2.5 py-1 text-xs font-medium text-ink-muted hover:text-ink"
    >
      {done ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
      {done ? "Copied" : label}
    </button>
  );
}
