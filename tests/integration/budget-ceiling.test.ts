import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";
import { campaigns, submissions } from "@/db/schema";
import { approveSubmission, rejectSubmission } from "@/server/services/approval";
import { addMetric, createCampaign, createSubmission, createUser } from "../helpers/factories";

const campaignRow = async (id: string) =>
  (await db.select().from(campaigns).where(eq(campaigns.id, id)))[0]!;
const submissionRow = async (id: string) =>
  (await db.select().from(submissions).where(eq(submissions.id, id)))[0]!;

describe("approval and the budget ceiling", () => {
  it("approves within budget: freezes earnings from the latest metric, debits spend", async () => {
    const creator = await createUser();
    const campaign = await createCampaign({
      payoutPer1kViewsCents: 100,
      totalBudgetCents: 10_000,
    });
    const sub = await createSubmission({
      campaignId: campaign.id,
      creatorId: creator.id,
    });
    await addMetric(sub.id, 4_000, 2);
    await addMetric(sub.id, 12_500, 0); // latest wins: floor(12.5k/1k)*100 = 1200

    const res = await approveSubmission(sub.id);
    expect(res.earningsCents).toBe(1_200);
    expect(res.campaignCompleted).toBe(false);

    expect((await campaignRow(campaign.id)).spentCents).toBe(1_200);
    const s = await submissionRow(sub.id);
    expect(s.status).toBe("approved");
    expect(s.lockedEarningsCents).toBe(1_200);
    expect(s.reviewedAt).not.toBeNull();
  });

  it("a submission with no metrics approves at zero earnings", async () => {
    const creator = await createUser();
    const campaign = await createCampaign();
    const sub = await createSubmission({
      campaignId: campaign.id,
      creatorId: creator.id,
    });

    const res = await approveSubmission(sub.id);
    expect(res.earningsCents).toBe(0);
    expect((await campaignRow(campaign.id)).spentCents).toBe(0);
    expect((await submissionRow(sub.id)).lockedEarningsCents).toBe(0);
  });

  it("rejects with BUDGET_EXCEEDED and rolls the whole approval back", async () => {
    const creator = await createUser();
    const campaign = await createCampaign({
      payoutPer1kViewsCents: 100,
      totalBudgetCents: 1_000, // covers 10k views
    });
    const sub = await createSubmission({
      campaignId: campaign.id,
      creatorId: creator.id,
    });
    await addMetric(sub.id, 25_000); // needs 2500 > 1000

    await expect(approveSubmission(sub.id)).rejects.toMatchObject({
      appCode: "BUDGET_EXCEEDED",
      payload: { remainingCents: 1_000, requiredCents: 2_500 },
    });

    // rollback: still pending, nothing frozen, nothing spent
    const s = await submissionRow(sub.id);
    expect(s.status).toBe("pending");
    expect(s.lockedEarningsCents).toBeNull();
    expect((await campaignRow(campaign.id)).spentCents).toBe(0);
  });

  it("auto-completes the campaign when spend reaches the budget exactly", async () => {
    const creator = await createUser();
    const campaign = await createCampaign({
      payoutPer1kViewsCents: 100,
      totalBudgetCents: 1_000,
    });
    const sub = await createSubmission({
      campaignId: campaign.id,
      creatorId: creator.id,
    });
    await addMetric(sub.id, 10_000); // exactly the budget

    const res = await approveSubmission(sub.id);
    expect(res.campaignCompleted).toBe(true);
    expect((await campaignRow(campaign.id)).status).toBe("completed");

    // and the queue is now frozen: further approvals fail typed
    const other = await createSubmission({
      campaignId: campaign.id,
      creatorId: creator.id,
    });
    await expect(approveSubmission(other.id)).rejects.toMatchObject({
      appCode: "CAMPAIGN_NOT_ACTIVE",
    });
    expect((await submissionRow(other.id)).status).toBe("pending");
  });

  it("never approves twice: second attempt is ALREADY_REVIEWED, budget debited once", async () => {
    const creator = await createUser();
    const campaign = await createCampaign({ payoutPer1kViewsCents: 100 });
    const sub = await createSubmission({
      campaignId: campaign.id,
      creatorId: creator.id,
    });
    await addMetric(sub.id, 5_000);

    await approveSubmission(sub.id);
    await expect(approveSubmission(sub.id)).rejects.toMatchObject({
      appCode: "ALREADY_REVIEWED",
    });
    expect((await campaignRow(campaign.id)).spentCents).toBe(500);
  });
});

describe("rejection", () => {
  it("rejects with a reason and never touches the budget", async () => {
    const creator = await createUser();
    const campaign = await createCampaign();
    const sub = await createSubmission({
      campaignId: campaign.id,
      creatorId: creator.id,
    });
    await addMetric(sub.id, 50_000);

    await rejectSubmission(sub.id, "Not related to the campaign brief");
    const s = await submissionRow(sub.id);
    expect(s.status).toBe("rejected");
    expect(s.rejectionReason).toBe("Not related to the campaign brief");
    expect(s.lockedEarningsCents).toBeNull();
    expect((await campaignRow(campaign.id)).spentCents).toBe(0);
  });

  it("cannot reject an already-reviewed submission", async () => {
    const creator = await createUser();
    const campaign = await createCampaign();
    const sub = await createSubmission({
      campaignId: campaign.id,
      creatorId: creator.id,
    });
    await approveSubmission(sub.id);
    await expect(rejectSubmission(sub.id, "too late")).rejects.toMatchObject({
      appCode: "ALREADY_REVIEWED",
    });
  });
});
