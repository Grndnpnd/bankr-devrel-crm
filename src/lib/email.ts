import { Resend } from "resend";

/**
 * Provider-agnostic email seam. Every feature that sends mail (invites now;
 * notifications and founder comms later) calls sendEmail() — not Resend directly —
 * so the provider can change without touching call sites.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface SendResult {
  ok: boolean;
  skipped?: boolean; // not configured (no API key) — treated as a soft no-op
  error?: string;
}

const apiKey = process.env.RESEND_API_KEY;
const fromAddress = process.env.EMAIL_FROM || "BANKRcrm <onboarding@resend.dev>";

const resend = apiKey ? new Resend(apiKey) : null;

/**
 * Send one email. Never throws — returns a result so callers can decide how to
 * react. If RESEND_API_KEY isn't set, this is a soft no-op ({ ok:false, skipped:true })
 * so the app works fully before the sending domain is verified.
 */
export async function sendEmail(msg: EmailMessage): Promise<SendResult> {
  if (!resend) return { ok: false, skipped: true, error: "email not configured" };
  try {
    const { error } = await resend.emails.send({
      from: fromAddress,
      to: msg.to,
      subject: msg.subject,
      html: msg.html,
      ...(msg.text ? { text: msg.text } : {}),
    });
    if (error) return { ok: false, error: error.message || "send failed" };
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "send failed" };
  }
}

export const emailConfigured = (): boolean => !!resend;
