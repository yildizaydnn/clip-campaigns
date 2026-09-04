import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Deliberately minimal session: a signed userId, per the brief ("a signed
 * cookie holding a userId ... is enough"). HMAC-SHA256 with a server secret;
 * verification is constant-time. No expiry, no rotation — real auth is
 * explicitly out of scope.
 */

export const SESSION_COOKIE = "session";

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return s;
}

function hmac(value: string): Buffer {
  return createHmac("sha256", secret()).update(value).digest();
}

export function signSession(userId: string): string {
  return `${userId}.${hmac(userId).toString("base64url")}`;
}

export function verifySession(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot < 1) return null;
  const userId = raw.slice(0, dot);
  const given = Buffer.from(raw.slice(dot + 1), "base64url");
  const expected = hmac(userId);
  if (given.length !== expected.length) return null;
  return timingSafeEqual(given, expected) ? userId : null;
}

export function sessionSetCookie(userId: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${signSession(userId)}; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

/** tiny cookie-header parser — one cookie, no dependency needed */
export function readSessionCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const eq = part.indexOf("=");
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === SESSION_COOKIE)
      return part.slice(eq + 1).trim();
  }
  return null;
}
