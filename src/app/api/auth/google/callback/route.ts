import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createToken, setSessionCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

/** Build a redirect back to the login page with an error code. */
function loginError(base: string, code: string) {
  return NextResponse.redirect(`${base}/login?error=${encodeURIComponent(code)}`);
}

/** OAuth callback: exchange the code, verify the user is a pre-added active account, issue our session. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = process.env.APP_URL || url.origin;
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const cookieState = req.headers.get("cookie")?.match(/g_oauth_state=([^;]+)/)?.[1];

  if (!code || !state || !cookieState || state !== cookieState) {
    return loginError(base, "oauth_state");
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return loginError(base, "oauth_config");
  const redirectUri = `${base}/api/auth/google/callback`;

  // 1) Exchange the authorization code for tokens.
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code, client_id: clientId, client_secret: clientSecret,
      redirect_uri: redirectUri, grant_type: "authorization_code",
    }),
  });
  const tokenBody = await tokenRes.json().catch(() => null);
  if (!tokenRes.ok || !tokenBody) {
    // Google returns { error, error_description } — surface it so the cause is visible.
    const detail = tokenBody?.error_description || tokenBody?.error || `http_${tokenRes.status}`;
    return loginError(base, `oauth_exchange:${detail}`);
  }
  const tokens = tokenBody;
  const accessToken = tokens?.access_token;
  if (!accessToken) return loginError(base, "oauth_exchange");

  // 2) Fetch the verified profile.
  const profRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!profRes.ok) return loginError(base, "oauth_profile");
  const profile = await profRes.json().catch(() => null);
  const email = String(profile?.email ?? "").toLowerCase();
  const emailVerified = profile?.email_verified === true || profile?.email_verified === "true";
  if (!email || !emailVerified) return loginError(base, "oauth_unverified");

  // 3) Optional domain guard (defense-in-depth alongside the consent screen's "Internal" setting).
  const hd = process.env.GOOGLE_HOSTED_DOMAIN;
  if (hd && !email.endsWith(`@${hd}`)) return loginError(base, "oauth_domain");

  // 4) Gate: only pre-added, active accounts may sign in. Role comes from the User record.
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) return loginError(base, "not_invited");
  if ((user as any).active === false) return loginError(base, "deactivated");

  // 5) Issue our own session cookie — identical to password login.
  const token = await createToken({ id: user.id, email: user.email, name: user.name, role: user.role });
  await setSessionCookie(token);

  const res = NextResponse.redirect(`${base}/`);
  res.cookies.delete("g_oauth_state");
  return res;
}
