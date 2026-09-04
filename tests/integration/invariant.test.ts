import { eq, inArray } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";
import { campaigns, submissions } from "@/db/schema";
import { approveSubmission, rejectSubmission } from "@/server/services/approval";
import { addMetric, createCampaign, createSubmission, createUser } from "../helpers/factories";

/**
 * spent_cents is denormalized on purpose (it is what the conditional UPDATE
 * serializes on). This test is the promised proof that the denormalization
 * is maintained: after a messy mix of concurrent approvals, rejections and
 * refused over-budget attempts, spent_cents still equals the sum of frozen
 * earnings on approved submissions.
 */
describe("invariant: spent_cents == SUM(locked_earnings_cents)", () => {
  it("holds after a mixed, partly concurrent review session", async () => {
    const creator = await createUser();
    const campaign = await createCampaign({
      payoutPer1kViewsCents: 100,
      totalBudgetCents: 5_000,
    });
    const subs = await Promise.all(
      Array.from({ length: 8 }, () =>
        createSubmission({ campaignId: campaign.id, creatorId: creator.id }),
      ),
    );
    // views: 3k, 6k, 9k, ... -> earnings 300, 600, 900, ...
    await Promise.all(subs.map((s, i) => addMetric(s.id, (i + 1) * 3_000)));

    // reject two, then race the remaining six approvals (total demand 6_000 > 5_000)
    await rejectSubmission(subs[0]!.id, "off brief");
    await rejectSubmission(subs[7]!.id, "wrong platform");
    await Promise.allSettled(
      subs.slice(1, 7).map((s) => approveSubmission(s.id)),
    );

    const [c] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaign.id));
    const approved = await db
      .select({ locked: submissions.lockedEarningsCents })
      .from(submissions)
      .where(
        inArray(submissions.status, ["approved", "paid"]),
      );
    const lockedSum = approved.reduce((acc, r) => acc + (r.locked ?? 0), 0);

    expect(c!.spentCents).toBe(lockedSum);
    expect(c!.spentCents).toBeLessThanOrEqual(c!.totalBudgetCents);
  });
});
