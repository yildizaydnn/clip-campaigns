import { and, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { campaigns, submissions } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { createSubmissionSchema } from "@/lib/schemas/platform-url";
import {
  approveSubmissionSchema,
  rejectSubmissionSchema,
} from "@/lib/schemas/submission";
import {
  approveSubmission,
  rejectSubmission,
} from "@/server/services/approval";
import { calculateEarningsCents } from "@/server/services/payout";
import { adminProcedure, creatorProcedure, protectedProcedure, router } from "../trpc";

function isUniqueViolation(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const cause = (e as { cause?: { code?: string } }).cause;
  return (
    (e as { code?: string }).code === "23505" || cause?.code === "23505"
  );
}

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

  /** Creator submit — validations in order, first failure returns typed. */
  create: creatorProcedure
    .input(createSubmissionSchema)
    .mutation(async ({ ctx, input }) => {
      const [campaign] = await ctx.db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, input.campaignId));
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });
      if (campaign.status !== "active")
        throw new AppError({
          appCode: "CAMPAIGN_NOT_ACTIVE",
          message: "This campaign is not accepting submissions.",
        });
      const now = new Date();
      if (now < campaign.startsAt || now > campaign.endsAt)
        throw new AppError({
          appCode: "CAMPAIGN_NOT_IN_WINDOW",
          message: "Submissions are only accepted during the campaign period.",
          payload: {
            startsAt: campaign.startsAt.toISOString(),
            endsAt: campaign.endsAt.toISOString(),
          },
        });
      if (!campaign.platforms.includes(input.platform))
        throw new AppError({
          appCode: "PLATFORM_NOT_ALLOWED",
          message: `This campaign only accepts: ${campaign.platforms.join(", ")}.`,
          payload: { allowed: campaign.platforms },
        });

      try {
        const [row] = await ctx.db
          .insert(submissions)
          .values({
            campaignId: input.campaignId,
            creatorId: ctx.user.id,
            postUrl: input.postUrl,
            platform: input.platform,
          })
          .returning();
        return row!;
      } catch (e) {
        // the unique constraint settles the duplicate race, not a pre-check
        if (isUniqueViolation(e))
          throw new AppError({
            appCode: "DUPLICATE_URL",
            message: "This URL was already submitted to this campaign.",
          });
        throw e;
      }
    }),

  /** "My submissions" — status, current views, earnings (frozen or estimated). */
  mine: creatorProcedure.query(async ({ ctx }) => {
    const rows = (await ctx.db.execute(sql`
      SELECT s.id, s.post_url, s.platform, s.status, s.rejection_reason,
             s.locked_earnings_cents, s.created_at,
             c.title AS campaign_title, c.payout_per_1k_views_cents,
             COALESCE((
               SELECT m.views FROM submission_metrics m
               WHERE m.submission_id = s.id
               ORDER BY m.captured_at DESC LIMIT 1
             ), 0)::int AS views
      FROM submissions s
      JOIN campaigns c ON c.id = s.campaign_id
      WHERE s.creator_id = ${ctx.user.id}
      ORDER BY s.created_at DESC
    `)) as unknown as {
      id: string;
      post_url: string;
      platform: string;
      status: "pending" | "approved" | "rejected" | "paid";
      rejection_reason: string | null;
      locked_earnings_cents: number | null;
      created_at: string;
      campaign_title: string;
      payout_per_1k_views_cents: number;
      views: number;
    }[];

    return rows.map((r) => {
      const frozen = r.status === "approved" || r.status === "paid";
      return {
        id: r.id,
        postUrl: r.post_url,
        platform: r.platform,
        status: r.status,
        rejectionReason: r.rejection_reason,
        campaignTitle: r.campaign_title,
        views: r.views,
        // frozen at approval time vs a live estimate while still pending
        earningsCents: frozen
          ? (r.locked_earnings_cents ?? 0)
          : calculateEarningsCents(r.views, r.payout_per_1k_views_cents),
        earningsFrozen: frozen,
        createdAt: r.created_at,
      };
    });
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
