import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Redirect to Google's OAuth consent screen. */
export async function GET(req: Request) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const base = process.env.APP_URL || new URL(req.url).origin;
  if (!clientId) {
    return NextResponse.json({ error: "Google sign-in is not configured." }, { status: 500 });
  }
  const redirectUri = `${base}/api/auth/google/callback`;
  // CSRF state: random value echoed back and checked in the callback.
  const state = crypto.randomUUID();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "openid email profile",
    access_type: "online",
    prompt: "select_account",
    state,
  });
  // Restrict the picker to the Workspace domain when configured.
  if (process.env.GOOGLE_HOSTED_DOMAIN) params.set("hd", process.env.GOOGLE_HOSTED_DOMAIN);

  const res = NextResponse.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
  res.cookies.set("g_oauth_state", state, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: 600,
  });
  return res;
}
