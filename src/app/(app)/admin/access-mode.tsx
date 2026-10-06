"use client";

import { useState } from "react";
import { Input } from "@/components/ui/primitives";

/** Invite by email (they choose a password) or create the account with a password the admin sets. */
export function AccessMode() {
  const [mode, setMode] = useState<"invite" | "password">("invite");
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-muted">How should they get in?</p>
      <div className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm text-ink">
        <label className="flex items-center gap-1.5">
          <input type="radio" name="mode" value="invite" checked={mode === "invite"} onChange={() => setMode("invite")} className="accent-brand-500" />
          Send invite email (they choose their password)
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" name="mode" value="password" checked={mode === "password"} onChange={() => setMode("password")} className="accent-brand-500" />
          Set a password now
        </label>
      </div>
      {mode === "password" && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            name="password"
            type={show ? "text" : "password"}
            autoComplete="new-password"
            minLength={10}
            required
            placeholder="At least 10 characters, letters + numbers"
            className="w-72"
          />
          <button type="button" onClick={() => setShow((s) => !s)} className="text-xs text-brand-600 hover:underline">
            {show ? "Hide" : "Show"}
          </button>
          <p className="w-full text-xs text-ink-faint">
            The account is ready immediately. Share the password privately (not by email/chat) and ask them to change it in Settings.
          </p>
        </div>
      )}
    </div>
  );
}
