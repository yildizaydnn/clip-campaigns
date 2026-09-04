import { db } from "@/db";

/**
 * Per-request tRPC context. The session user is resolved from the signed
 * cookie in the auth layer commit; until then it is always null so the
 * procedure middlewares built on top of it fail closed.
 */
export async function createContext(opts: {
  headers: Headers;
  resHeaders?: Headers;
}) {
  return {
    db,
    headers: opts.headers,
    /** response headers — the dev user switcher writes Set-Cookie here */
    resHeaders: opts.resHeaders,
    user: null as { id: string; role: "admin" | "creator" } | null,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
