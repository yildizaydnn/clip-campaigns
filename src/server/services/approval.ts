import { and, desc, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { db } from "@/db";
import { campaigns, submissionMetrics, submissions } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { calculateEarningsCents } from "./payout";

/**
 * Approval — the one place money moves. Single transaction, and the budget
 * ceiling is enforced by a conditional UPDATE on the campaign row:
 *
 *   SET spent_cents = spent_cents + $earnings
 *   WHERE status = 'active' AND spent_cents + $earnings <= total_budget_cents
 *
 * Under READ COMMITTED, a concurrent approval blocks on the row lock; when it
 * resumes, Postgres re-evaluates the WHERE against the *updated* row. If the
 * budget no longer covers it, zero rows update and we roll back. No explicit
 * locks, no SERIALIZABLE retries — the UPDATE itself serializes the race.
 *
 * Two conditional updates do two different jobs: the submission update stops
 * the SAME submission being approved twice (double-debit); the campaign
 * update settles DIFFERENT submissions racing for the remaining budget.
 */
export async function approveSubmission(submissionId: string) {
  return db.transaction(async (tx) => {
    const [sub] = await tx
      .select({
        id: submissions.id,
        campaignId: submissions.campaignId,
        status: submissions.status,
      })
      .from(submissions)
      .where(eq(submissions.id, submissionId));
    if (!sub) throw new TRPCError({ code: "NOT_FOUND" });

    const [campaign] = await tx
      .select({
        id: campaigns.id,
        payoutPer1kViewsCents: campaigns.payoutPer1kViewsCents,
      })
      .from(campaigns)
      .where(eq(campaigns.id, sub.campaignId));
    if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });

    // Earnings come from the most recent metric row; a submission that has
    // never been synced earns 0 — approval passes, nothing is debited.
    const [latest] = await tx
      .select({ views: submissionMetrics.views })
      .from(submissionMetrics)
      .where(eq(submissionMetrics.submissionId, submissionId))
      .orderBy(desc(submissionMetrics.capturedAt))
      .limit(1);
    const earningsCents = calculateEarningsCents(
      latest?.views ?? 0,
      campaign.payoutPer1kViewsCents,
    );

    // Freeze the earnings and leave 'pending' — guards double approval.
    const marked = await tx
      .update(submissions)
      .set({
        status: "approved",
        lockedEarningsCents: earningsCents,
        reviewedAt: new Date(),
      })
      .where(
        and(eq(submissions.id, submissionId), eq(submissions.status, "pending")),
      )
      .returning({ id: submissions.id });
    if (marked.length === 0)
      throw new AppError({
        appCode: "ALREADY_REVIEWED",
        message: "This submission has already been reviewed.",
      });

    // Debit the budget — the concurrent race settles on this row lock.
    const [debited] = await tx
      .update(campaigns)
      .set({ spentCents: sql`${campaigns.spentCents} + ${earningsCents}` })
      .where(
        and(
          eq(campaigns.id, campaign.id),
          eq(campaigns.status, "active"),
          sql`${campaigns.spentCents} + ${earningsCents} <= ${campaigns.totalBudgetCents}`,
        ),
      )
      .returning({
        spentCents: campaigns.spentCents,
        totalBudgetCents: campaigns.totalBudgetCents,
      });

    if (!debited) {
      // Zero rows: either the campaign is not active, or the budget cannot
      // cover this approval. Re-read (new snapshot) to report which — the
      // throw rolls the submission update back with everything else.
      const [current] = await tx
        .select({
          status: campaigns.status,
          spentCents: campaigns.spentCents,
          totalBudgetCents: campaigns.totalBudgetCents,
        })
        .from(campaigns)
        .where(eq(campaigns.id, campaign.id));
      if (!current || current.status !== "active")
        throw new AppError({
          appCode: "CAMPAIGN_NOT_ACTIVE",
          message: "This campaign is no longer active.",
        });
      throw new AppError({
        appCode: "BUDGET_EXCEEDED",
        message: "Approving this submission would exceed the campaign budget.",
        payload: {
          remainingCents: current.totalBudgetCents - current.spentCents,
          requiredCents: earningsCents,
        },
      });
    }

    // "Once the remaining budget reaches zero, the campaign becomes
    // completed on its own."
    const campaignCompleted = debited.spentCents >= debited.totalBudgetCents;
    if (campaignCompleted) {
      await tx
        .update(campaigns)
        .set({ status: "completed" })
        .where(eq(campaigns.id, campaign.id));
    }

    return {
      earningsCents,
      spentCents: debited.spentCents,
      remainingCents: debited.totalBudgetCents - debited.spentCents,
      campaignCompleted,
    };
  });
}

/** Rejection never touches the budget; it only needs the reason. */
export async function rejectSubmission(submissionId: string, reason: string) {
  const updated = await db
    .update(submissions)
    .set({ status: "rejected", rejectionReason: reason, reviewedAt: new Date() })
    .where(
      and(eq(submissions.id, submissionId), eq(submissions.status, "pending")),
    )
    .returning({ id: submissions.id });
  if (updated.length > 0) return { ok: true as const };

  const [exists] = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(eq(submissions.id, submissionId));
  if (!exists) throw new TRPCError({ code: "NOT_FOUND" });
  throw new AppError({
    appCode: "ALREADY_REVIEWED",
    message: "This submission has already been reviewed.",
  });
}
