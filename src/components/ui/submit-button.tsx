"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "./button";

/** Submit button that disables itself and shows `pendingText` while its form's server action runs. */
export function SubmitButton({ pendingText, children, disabled, ...props }: ButtonProps & { pendingText: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={disabled || pending} aria-busy={pending} {...props}>
      {pending ? pendingText : children}
    </Button>
  );
}
