import { describe, expect, it } from "vitest";

import { callerFor } from "../helpers/caller";
import { addMetric, createCampaign, createSubmission, createUser } from "../helpers/factories";

const asAdmin = async () => {
  const admin = await createUser({ role: "admin" });
  return callerFor({ id: admin.id, email: admin.email, role: "admin" }).caller;
};

describe("campaign.list — server-side pagination, search, filter", () => {
  it("paginates and filters on the server", async () => {
    const caller = await asAdmin();
    for (let i = 0; i < 12; i++)
      await createCampaign({ title: `Alpha ${i}`, status: "active" });
    await createCampaign({ title: "Beta special", status: "draft" });

    const page1 = await caller.campaign.list({ page: 1, pageSize: 10 });
    expect(page1.items).toHaveLength(10);
    expect(page1.total).toBe(13);
    expect(page1.pageCount).toBe(2);

    const filtered = await caller.campaign.list({
      page: 1,
      pageSize: 10,
      status: "draft",
    });
    expect(filtered.items).toHaveLength(1);

    const searched = await caller.campaign.list({
      page: 1,
      pageSize: 10,
      search: "beta",
    });
    expect(searched.items).toHaveLength(1);
    expect(searched.items[0]!.title).toBe("Beta special");
  });
});

describe("campaign.overview — daily series", () => {
  it("covers the whole campaign period with explicit zeros for silent days", async () => {
    const DAY = 24 * 60 * 60 * 1000;
    const caller = await asAdmin();
    const creator = await createUser();
    const campaign = await createCampaign({
      startsAt: new Date(Date.now() - 6 * DAY),
      endsAt: new Date(Date.now() + 3 * DAY),
      payoutPer1kViewsCents: 100,
    });
    const sub = await createSubmission({
      campaignId: campaign.id,
      creatorId: creator.id,
      status: "approved",
      lockedEarningsCents: 0,
    });
    // metrics on only two days of a ten-day window
    await addMetric(sub.id, 5_000, 4);
    await addMetric(sub.id, 9_000, 2);

    const o = await caller.campaign.overview({ id: campaign.id });
    expect(o.daily).toHaveLength(10); // full period, no gaps
    const nonZero = o.daily.filter((d) => d.views > 0);
    expect(nonZero).toHaveLength(2);
    expect(nonZero.map((d) => d.views).sort()).toEqual([5_000, 9_000]);
    expect(o.approvedViews).toBe(9_000); // latest metric, not the sum
  });
});

describe("campaign.update — budget guard", () => {
  it("refuses lowering the budget below locked-in spend, with a readable error", async () => {
    const caller = await asAdmin();
    const creator = await createUser();
    const campaign = await createCampaign({
      payoutPer1kViewsCents: 100,
      totalBudgetCents: 10_000,
    });
    const sub = await createSubmission({
      campaignId: campaign.id, creatorId: creator.id,
    });
    await addMetric(sub.id, 50_000); // locks 5_000 on approval
    const { approveSubmission } = await import("@/server/services/approval");
    await approveSubmission(sub.id);

    await expect(
      caller.campaign.update({
        id: campaign.id,
        data: {
          title: campaign.title,
          platforms: campaign.platforms,
          payoutPer1kViewsCents: campaign.payoutPer1kViewsCents,
          totalBudgetCents: 4_000, // below the 5_000 already locked
          startsAt: campaign.startsAt,
          endsAt: campaign.endsAt,
        },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    // raising it is fine
    const updated = await caller.campaign.update({
      id: campaign.id,
      data: {
        title: campaign.title,
        platforms: campaign.platforms,
        payoutPer1kViewsCents: campaign.payoutPer1kViewsCents,
        totalBudgetCents: 20_000,
        startsAt: campaign.startsAt,
        endsAt: campaign.endsAt,
      },
    });
    expect(updated.totalBudgetCents).toBe(20_000);
  });
});
