/**
 * Email templates. Each returns { subject, html, text }. Keep them simple and
 * inline-styled — email clients don't support external CSS or modern layout.
 */

const BRAND = "#F5A623";
const BG = "#0D0D0D";
const CARD = "#1A1A1A";

function shell(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html><body style="margin:0;padding:0;background:${BG};font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#F0F0F0;">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px;">
    <div style="font-size:20px;font-weight:700;color:${BRAND};margin-bottom:24px;">BANKRcrm</div>
    <div style="background:${CARD};border:1px solid rgba(255,255,255,0.06);border-radius:12px;padding:28px;">
      <h1 style="font-size:18px;font-weight:700;margin:0 0 16px;color:#F0F0F0;">${title}</h1>
      ${bodyHtml}
    </div>
    <div style="font-size:11px;color:#525252;margin-top:20px;text-align:center;">
      BANKRcrm · internal team tool
    </div>
  </div>
</body></html>`;
}

export interface InviteEmailParams {
  name?: string | null;
  email: string;
  tempPassword: string;
  role: string;
  loginUrl: string;
  invitedBy?: string | null;
}

export function inviteEmail(p: InviteEmailParams): { subject: string; html: string; text: string } {
  const greeting = p.name ? `Hi ${p.name},` : "Hi,";
  const roleLabel = p.role === "ADMIN" ? "Admin" : p.role === "SUPPORT" ? "Support" : p.role === "ENGINEERING" ? "Engineering" : "DevRel";
  const inviter = p.invitedBy ? ` by ${p.invitedBy}` : "";

  const html = shell("You've been added to BANKRcrm", `
    <p style="font-size:14px;line-height:1.6;color:#C9C9C9;margin:0 0 16px;">${greeting}</p>
    <p style="font-size:14px;line-height:1.6;color:#C9C9C9;margin:0 0 20px;">
      You've been added${inviter} as <strong style="color:#F0F0F0;">${roleLabel}</strong>. Use the temporary password below to sign in, then change it under Settings → Account.
    </p>
    <div style="background:#141414;border:1px solid rgba(255,255,255,0.1);border-radius:8px;padding:14px 16px;margin:0 0 22px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#525252;margin-bottom:6px;">Email</div>
      <div style="font-size:14px;color:#F0F0F0;margin-bottom:14px;">${p.email}</div>
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#525252;margin-bottom:6px;">Temporary password</div>
      <div style="font-size:15px;font-family:ui-monospace,Menlo,Consolas,monospace;color:${BRAND};font-weight:600;">${p.tempPassword}</div>
    </div>
    <a href="${p.loginUrl}" style="display:inline-block;background:${BRAND};color:#0D0D0D;font-weight:600;font-size:14px;text-decoration:none;padding:11px 22px;border-radius:8px;">Sign in</a>
    <p style="font-size:12px;line-height:1.6;color:#525252;margin:22px 0 0;">
      If you can sign in with Google using this email, you can use that instead — no password needed.
    </p>
  `);

  const text = `${greeting}

You've been added${inviter} to BANKRcrm as ${roleLabel}.

Email: ${p.email}
Temporary password: ${p.tempPassword}

Sign in: ${p.loginUrl}

After signing in, change your password under Settings → Account. If your email works with Google sign-in, you can use that instead.`;

  return { subject: "Your BANKRcrm access", html, text };
}
