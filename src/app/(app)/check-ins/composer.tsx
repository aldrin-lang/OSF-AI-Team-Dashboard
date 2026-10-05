"use client";

import { useState } from "react";
import { Input, Label, Textarea } from "@/components/ui/primitives";
import { SubmitButton } from "@/components/ui/submit-button";
import { whatsappLink } from "@/lib/ops-core";
import { markSent, sendCheckin } from "./actions";

/** Edit the drafted check-in, then send by email, open WhatsApp with it pre-filled, or log a call. */
export function CheckinComposer({
  id,
  subject,
  message,
  email,
  phone,
}: {
  id: string;
  subject: string;
  message: string;
  email: string | null;
  phone: string | null;
}) {
  const [subj, setSubj] = useState(subject);
  const [msg, setMsg] = useState(message);
  const [to, setTo] = useState(email ?? "");
  const wa = whatsappLink(phone, msg);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label>Email to</Label>
          <Input value={to} onChange={(e) => setTo(e.target.value)} placeholder="no email on file" type="email" />
        </div>
        <div>
          <Label>Subject</Label>
          <Input value={subj} onChange={(e) => setSubj(e.target.value)} maxLength={200} />
        </div>
      </div>
      <div>
        <Label>Message</Label>
        <Textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={9} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <form action={sendCheckin}>
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="to" value={to} />
          <input type="hidden" name="subject" value={subj} />
          <input type="hidden" name="message" value={msg} />
          <SubmitButton size="sm" pendingText="Sending…" disabled={!to.trim()}>
            Send email
          </SubmitButton>
        </form>
        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
          >
            Open WhatsApp
          </a>
        )}
        <form action={markSent} className="flex items-center gap-2">
          <input type="hidden" name="id" value={id} />
          <input type="hidden" name="subject" value={subj} />
          <input type="hidden" name="message" value={msg} />
          {wa && (
            <SubmitButton size="sm" variant="secondary" name="channel" value="whatsapp" pendingText="Saving…">
              I sent it on WhatsApp
            </SubmitButton>
          )}
          <SubmitButton size="sm" variant="secondary" name="channel" value="call" pendingText="Saving…">
            I called instead
          </SubmitButton>
        </form>
      </div>
      {!wa && <p className="text-xs text-ink-faint">No phone number on file, so no WhatsApp link.</p>}
    </div>
  );
}
