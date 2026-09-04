import { initTRPC } from "@trpc/server";
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
        // typed errors the UI can act on (FLOWS: BUDGET_EXCEEDED etc.)
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
// protectedProcedure / adminProcedure / creatorProcedure land with the auth layer.
