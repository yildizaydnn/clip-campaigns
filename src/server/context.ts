import { eq } from "drizzle-orm";

import { db } from "@/db";
import { users } from "@/db/schema";
import { readSessionCookie, verifySession } from "@/lib/auth/cookie";

export type SessionUser = {
  id: string;
  email: string;
  role: "admin" | "creator";
};

/**
 * Per-request tRPC context. The user is resolved from the signed session
 * cookie; a missing, tampered or stale cookie yields user: null and the
 * procedure middlewares fail closed.
 */
export async function createContext(opts: {
  headers: Headers;
  resHeaders?: Headers;
}) {
  let user: SessionUser | null = null;

  const userId = verifySession(readSessionCookie(opts.headers.get("cookie")));
  if (userId) {
    try {
      const [row] = await db
        .select({ id: users.id, email: users.email, role: users.role })
        .from(users)
        .where(eq(users.id, userId));
      user = row ?? null;
    } catch {
      // e.g. a syntactically invalid uuid in a forged cookie — treat as anonymous
      user = null;
    }
  }

  return {
    db,
    headers: opts.headers,
    /** response headers — the user switcher writes Set-Cookie here */
    resHeaders: opts.resHeaders,
    user,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
