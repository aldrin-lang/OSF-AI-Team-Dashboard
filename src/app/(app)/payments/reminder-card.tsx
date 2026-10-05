import { Badge } from "@/components/ui/badge";
import { Input, Label, Textarea } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { REMINDER_STAGE_LABEL } from "@/lib/ops-core";
import { relativeTime } from "@/lib/utils";
import { sendReminderAction, skipReminder } from "./actions";
import type { PaymentReminder } from "@/lib/types";

/** A drafted reminder: editable, then send or skip. Sent/skipped ones show read-only. */
export function ReminderCard({
  r,
  to,
  back,
  canSend,
  title,
}: {
  r: PaymentReminder;
  to: string | null;
  back: "list" | "invoice";
  canSend: boolean;
  title?: React.ReactNode;
}) {
  const head = (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {title}
      <Badge tone={r.stage.startsWith("overdue") ? "red" : r.stage === "manual" ? "neutral" : "amber"}>
        {REMINDER_STAGE_LABEL[r.stage]}
      </Badge>
      <Badge tone={r.status === "sent" ? "green" : r.status === "skipped" ? "neutral" : "blue"}>
        {r.status === "sent" ? `Sent ${relativeTime(r.sent_at)}` : r.status === "skipped" ? "Skipped" : "Draft"}
      </Badge>
      <span className="ml-auto text-xs text-ink-faint">{to ? `to ${to}` : "no billing email"}</span>
    </div>
  );

  if (r.status !== "draft" || !canSend) {
    return (
      <div className="space-y-2 rounded-xl border border-line p-3">
        {head}
        <details className="text-sm">
          <summary className="cursor-pointer text-ink-faint">{r.subject}</summary>
          <p className="mt-2 whitespace-pre-wrap text-ink-muted">{r.body}</p>
        </details>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-line p-3">
      {head}
      <form action={sendReminderAction} className="space-y-2">
        <input type="hidden" name="id" value={r.id} />
        <input type="hidden" name="invoice_id" value={r.invoice_id} />
        <input type="hidden" name="back" value={back} />
        <div>
          <Label>Subject</Label>
          <Input name="subject" defaultValue={r.subject} maxLength={200} />
        </div>
        <div>
          <Label>Message</Label>
          <Textarea name="body" defaultValue={r.body} rows={8} />
        </div>
        <div className="flex items-center gap-2">
          <SubmitButton size="sm" pendingText="Sending…" disabled={!to}>
            Send reminder
          </SubmitButton>
          <SubmitButton size="sm" variant="ghost" formAction={skipReminder} pendingText="Skipping…">
            Skip
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}
