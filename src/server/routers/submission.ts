import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { submissions } from "@/db/schema";
import {
  approveSubmissionSchema,
  rejectSubmissionSchema,
} from "@/lib/schemas/submission";
import {
  approveSubmission,
  rejectSubmission,
} from "@/server/services/approval";
import { adminProcedure, protectedProcedure, router } from "../trpc";

export const submissionRouter = router({
  /**
   * Ownership lives in the WHERE clause: a creator only ever matches their
   * own rows, so someone else's id yields NOT_FOUND — indistinguishable from
   * a row that does not exist. Admins can read any submission.
   */
  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const where =
        ctx.user.role === "admin"
          ? eq(submissions.id, input.id)
          : and(
              eq(submissions.id, input.id),
              eq(submissions.creatorId, ctx.user.id),
            );
      const [row] = await ctx.db.select().from(submissions).where(where);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  approve: adminProcedure
    .input(approveSubmissionSchema)
    .mutation(({ input }) => approveSubmission(input.submissionId)),

  reject: adminProcedure
    .input(rejectSubmissionSchema)
    .mutation(({ input }) =>
      rejectSubmission(input.submissionId, input.reason),
    ),
});
