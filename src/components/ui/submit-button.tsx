"use client";

import { useFormStatus } from "react-dom";
import { Loader2 } from "lucide-react";
import { Button, type ButtonProps } from "./button";

/** Submit button that disables itself and shows a spinner + `pendingText` while its form's server action runs. */
export function SubmitButton({ pendingText, children, disabled, ...props }: ButtonProps & { pendingText: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={disabled || pending} aria-busy={pending} {...props}>
      {pending ? (
        <span key="pending" className="inline-flex items-center gap-1.5 [animation:fade-in_.2s_ease]">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {pendingText}
        </span>
      ) : (
        <span key="idle" className="inline-flex items-center gap-2 [animation:fade-in_.2s_ease]">
          {children}
        </span>
      )}
    </Button>
  );
}
