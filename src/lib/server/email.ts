import "server-only";

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export interface SendEmailInput {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
}

/** Minimal Resend client (no SDK dependency). No-ops if RESEND_API_KEY is unset. */
export async function sendEmail(input: SendEmailInput): Promise<{ ok: boolean; skipped?: boolean }> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) {
    console.warn("[email] RESEND_API_KEY / EMAIL_FROM not set — skipping send:", input.subject);
    return { ok: true, skipped: true };
  }

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: Array.isArray(input.to) ? input.to : [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
  });

  if (!res.ok) {
    console.error("[email] send failed", res.status, await res.text());
    return { ok: false };
  }
  return { ok: true };
}

export function emailShell(title: string, bodyHtml: string, ctaUrl?: string, ctaLabel?: string) {
  const appUrl = process.env.APP_URL ?? "";
  return `
  <div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:0 auto;color:#171717">
    <h2 style="font-size:16px;margin:0 0 12px">${title}</h2>
    <div style="font-size:14px;line-height:1.5">${bodyHtml}</div>
    ${
      ctaUrl
        ? `<p style="margin:20px 0"><a href="${ctaUrl}" style="background:#171717;color:#fff;text-decoration:none;padding:8px 16px;border-radius:6px;font-size:13px">${ctaLabel ?? "Open"}</a></p>`
        : ""
    }
    <hr style="border:none;border-top:1px solid #e5e5e5;margin:20px 0"/>
    <p style="font-size:11px;color:#888">
      AI Receptionist Ops · <a href="${appUrl}/settings" style="color:#888">Notification settings</a>
    </p>
  </div>`;
}
