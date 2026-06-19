import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

import { COOKIE } from "./constants";
export { COOKIE };
const ALG = "HS256";
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export type Role = "ADMIN" | "DEVREL" | "SUPPORT" | "ENGINEERING";
export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
}

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(s);
}

export const hashPassword = (pw: string) => bcrypt.hash(pw, 10);
export const verifyPassword = (pw: string, hash: string) => bcrypt.compare(pw, hash);

export async function createToken(user: SessionUser): Promise<string> {
  return new SignJWT({ email: user.email, name: user.name, role: user.role })
    .setProtectedHeader({ alg: ALG })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
}

export async function verifyToken(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      id: String(payload.sub),
      email: String(payload.email),
      name: (payload.name as string) ?? null,
      role: (payload.role as Role) ?? "DEVREL",
    };
  } catch {
    return null;
  }
}

/** Read the current session in server components / route handlers. */
export async function getSession(): Promise<SessionUser | null> {
  const token = cookies().get(COOKIE)?.value;
  if (!token) return null;
  // Keep the capability-override cache warm so can() reflects admin edits.
  // (TTL-cached — not a DB hit on every call.)
  try { await (await import("@/lib/capabilityOverrides")).ensureCapabilityOverrides(); } catch { /* non-fatal */ }
  return verifyToken(token);
}

export async function setSessionCookie(token: string) {
  cookies().set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE,
  });
}

export async function clearSessionCookie() {
  cookies().delete(COOKIE);
}
