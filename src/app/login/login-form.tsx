"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/primitives";
import { signIn } from "./actions";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(signIn, null as { error?: string } | null);

  return (
    <form action={formAction} className="space-y-3.5">
      <input type="hidden" name="next" value={next} />
      <div>
        <label
          htmlFor="email"
          className="mb-1.5 block font-mono text-[10px] font-medium uppercase tracking-[0.13em] text-ink-faint"
        >
          Email
        </label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          autoFocus
          className="h-10 bg-white/80"
        />
      </div>
      <div>
        <label
          htmlFor="password"
          className="mb-1.5 block font-mono text-[10px] font-medium uppercase tracking-[0.13em] text-ink-faint"
        >
          Password
        </label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-10 bg-white/80"
        />
      </div>
      {state?.error && <p className="text-sm text-rose-600">{state.error}</p>}
      <Button type="submit" className="mt-1 h-10 w-full" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
