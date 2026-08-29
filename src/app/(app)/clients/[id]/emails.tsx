"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, Send, Trash2, Sparkles, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea, Label } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badge";
import { relativeTime } from "@/lib/utils";
import {
  generateEmailDraft,
  updateEmailDraft,
  sendClientEmail,
  deleteEmailDraft,
} from "../email-actions";
import type { ClientEmail, EmailTemplate } from "@/lib/types";

export function ClientEmails({
  clientId,
  emails,
  templates,
  peopleNames,
}: {
  clientId: string;
  emails: ClientEmail[];
  templates: EmailTemplate[];
  peopleNames: Record<string, string>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const drafts = emails.filter((e) => e.status === "draft");
  const sent = emails.filter((e) => e.status === "sent");

  return (
    <div className="space-y-4">
      {templates.length > 0 && (
        <div className="flex items-center gap-2">
          <Select
            defaultValue=""
            disabled={pending}
            onChange={(e) => {
              const templateId = e.target.value;
              if (!templateId) return;
              e.target.value = "";
              start(async () => {
                const id = await generateEmailDraft({ clientId, templateId });
                setEditing(id);
                router.refresh();
              });
            }}
            className="max-w-xs"
          >
            <option value="">Generate email from template…</option>
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <Sparkles className="h-4 w-4 text-accent-600" />
        </div>
      )}

      {err && <p className="text-sm text-rose-600">{err}</p>}

      {drafts.length === 0 && sent.length === 0 && (
        <p className="text-sm text-ink-faint">
          No emails yet. A handover draft is created automatically when a client reaches
          &ldquo;Client testing&rdquo;.
        </p>
      )}

      {drafts.map((d) =>
        editing === d.id ? (
          <form
            key={d.id}
            action={(fd) =>
              start(async () => {
                await updateEmailDraft(fd);
                setEditing(null);
                router.refresh();
              })
            }
            className="space-y-3 rounded-xl border border-line bg-fill p-3"
          >
            <input type="hidden" name="id" value={d.id} />
            <input type="hidden" name="client_id" value={clientId} />
            <div>
              <Label>To</Label>
              <Input name="to_email" type="email" defaultValue={d.to_email ?? ""} placeholder="client@example.com" />
            </div>
            <div>
              <Label>Subject</Label>
              <Input name="subject" defaultValue={d.subject} />
            </div>
            <div>
              <Label>Body</Label>
              <Textarea name="body" defaultValue={d.body} className="min-h-[220px] font-mono text-xs" />
            </div>
            <div className="flex gap-2">
              <Button size="sm" type="submit" variant="secondary" disabled={pending}>
                Save draft
              </Button>
              <Button size="sm" type="button" variant="ghost" onClick={() => setEditing(null)}>
                Cancel
              </Button>
            </div>
          </form>
        ) : (
          <div key={d.id} className="rounded-xl border border-line bg-fill p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 shrink-0 text-brand-600" />
                  <p className="truncate text-sm font-medium text-ink">{d.subject}</p>
                  <Badge tone="amber">Draft</Badge>
                </div>
                <p className="mt-0.5 text-xs text-ink-faint">
                  To: {d.to_email || "— add a recipient —"} · {relativeTime(d.created_at)}
                </p>
              </div>
            </div>
            <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-xs text-ink-muted">{d.body}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="secondary" onClick={() => setEditing(d.id)}>
                Edit
              </Button>
              <Button
                size="sm"
                disabled={pending || !d.to_email}
                onClick={() =>
                  start(async () => {
                    setErr(null);
                    const r = await sendClientEmail({ id: d.id, clientId });
                    if (!r.ok) setErr(r.error ?? "Send failed");
                    else router.refresh();
                  })
                }
              >
                <Send className="h-3.5 w-3.5" /> Send
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  start(async () => {
                    await deleteEmailDraft({ id: d.id, clientId });
                    router.refresh();
                  })
                }
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ),
      )}

      {sent.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-ink-faint">Sent</p>
          {sent.map((s) => (
            <div key={s.id} className="flex items-center gap-2 text-sm">
              <Check className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
              <span className="min-w-0 flex-1 truncate text-ink-muted">{s.subject}</span>
              <span className="shrink-0 text-xs text-ink-faint">
                {s.sent_by ? `${peopleNames[s.sent_by] ?? ""} · ` : ""}
                {relativeTime(s.sent_at)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
