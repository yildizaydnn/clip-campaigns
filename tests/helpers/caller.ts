import { db } from "@/db";
import type { Context, SessionUser } from "@/server/context";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

const factory = createCallerFactory(appRouter);

/**
 * Build a tRPC caller acting as the given user (or anonymous). Bypasses the
 * HTTP layer but exercises real procedures, middlewares and the real test
 * database. resHeaders is captured so cookie-writing mutations can be
 * asserted on.
 */
export function callerFor(user: SessionUser | null) {
  const resHeaders = new Headers();
  const ctx: Context = { db, headers: new Headers(), resHeaders, user };
  return { caller: factory(ctx), resHeaders };
}
