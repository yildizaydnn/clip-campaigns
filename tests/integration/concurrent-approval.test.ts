import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";
import { campaigns, submissions } from "@/db/schema";
import { approveSubmission } from "@/server/services/approval";
import { addMetric, createCampaign, createSubmission, createUser } from "../helpers/factories";

/**
 * The signature test of this project. Real parallelism: each
 * approveSubmission opens its own transaction on its own pool connection,
 * and the budget race settles on the campaign row lock inside Postgres —
 * exactly as it would with two admins clicking at the same moment.
 */
describe("concurrent approvals — first come, first served", () => {
  it("two simultaneous approvals against a budget that covers one: exactly one wins", async () => {
    const creator = await createUser();
    const campaign = await createCampaign({
      payoutPer1kViewsCents: 100,
      totalBudgetCents: 1_500, // each approval needs 1_000
    });
    const [a, b] = await Promise.all([
      createSubmission({ campaignId: campaign.id, creatorId: creator.id }),
      createSubmission({ campaignId: campaign.id, creatorId: creator.id }),
    ]);
    await addMetric(a.id, 10_000);
    await addMetric(b.id, 10_000);

    const results = await Promise.allSettled([
      approveSubmission(a.id),
      approveSubmission(b.id),
    ]);

    const wins = results.filter((r) => r.status === "fulfilled");
    const losses = results.filter((r) => r.status === "rejected");
    expect(wins).toHaveLength(1);
    expect(losses).toHaveLength(1);
    expect(losses[0]).toMatchObject({
      reason: { appCode: "BUDGET_EXCEEDED" },
    });

    // the ceiling held, and the loser fully rolled back
    const [c] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaign.id));
    expect(c!.spentCents).toBe(1_000);
    const rows = await db
      .select()
      .from(submissions)
      .where(eq(submissions.campaignId, campaign.id));
    expect(rows.filter((s) => s.status === "approved")).toHaveLength(1);
    expect(rows.filter((s) => s.status === "pending")).toHaveLength(1);
  });

  it("five simultaneous approvals, budget covers three: exactly three win, spend never exceeds the cap", async () => {
    const creator = await createUser();
    const campaign = await createCampaign({
      payoutPer1kViewsCents: 100,
      totalBudgetCents: 3_000,
    });
    const subs = await Promise.all(
      Array.from({ length: 5 }, () =>
        createSubmission({ campaignId: campaign.id, creatorId: creator.id }),
      ),
    );
    await Promise.all(subs.map((s) => addMetric(s.id, 10_000)));

    const results = await Promise.allSettled(
      subs.map((s) => approveSubmission(s.id)),
    );

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(3);

    const [c] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaign.id));
    expect(c!.spentCents).toBe(3_000);
    expect(c!.spentCents).toBeLessThanOrEqual(c!.totalBudgetCents);
    // budget fully consumed -> auto-completed
    expect(c!.status).toBe("completed");
    // late losers see NOT_ACTIVE (campaign completed) or BUDGET_EXCEEDED —
    // both are correct refusals; what matters is that no money moved
    const rows = await db
      .select()
      .from(submissions)
      .where(eq(submissions.campaignId, campaign.id));
    expect(rows.filter((s) => s.status === "approved")).toHaveLength(3);
  });
});
