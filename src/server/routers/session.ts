import { asc, eq } from "drizzle-orm";
import { z } from "zod";

import { users } from "@/db/schema";
import { sessionSetCookie } from "@/lib/auth/cookie";
import { publicProcedure, router } from "../trpc";
import { TRPCError } from "@trpc/server";

/**
 * The user switcher IS this demo's authentication: there is no login. It is
 * available in production too — the reviewer uses it on the live URL to act
 * as admin or creator. Stated in NOTES.md.
 */
export const sessionRouter = router({
  me: publicProcedure.query(({ ctx }) => ctx.user),

  listUsers: publicProcedure.query(({ ctx }) =>
    ctx.db
      .select({ id: users.id, email: users.email, role: users.role })
      .from(users)
      .orderBy(asc(users.role), asc(users.email)),
  ),

  switchUser: publicProcedure
    .input(z.object({ userId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [target] = await ctx.db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, input.userId));
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });

      // The only place a cookie is written — through tRPC, not a REST route.
      ctx.resHeaders?.append("Set-Cookie", sessionSetCookie(target.id));
      return { ok: true as const };
    }),
});
