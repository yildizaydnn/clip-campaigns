import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";

import { AppError } from "@/lib/errors";
import type { Context } from "./context";

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        // typed errors the UI can act on, e.g. BUDGET_EXCEEDED
        appCode: error instanceof AppError ? error.appCode : null,
        appPayload: error instanceof AppError ? (error.payload ?? null) : null,
        // field-level validation errors, bound back onto forms
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

export const router = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure;

/**
 * Layered authorization. Role checks live here; OWNERSHIP checks live in the
 * WHERE clause of each query — a creator asking for someone else's row gets
 * NOT_FOUND, indistinguishable from a row that does not exist.
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED" });
  return next({ ctx: { ...ctx, user: ctx.user } }); // narrows user to non-null
});

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
  return next();
});

export const creatorProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== "creator") throw new TRPCError({ code: "FORBIDDEN" });
  return next();
});
