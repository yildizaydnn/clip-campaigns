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
          status: campaign.status,
          platforms: campaign.platforms,
          payoutPer1kViewsCents: campaign.payoutPer1kViewsCents,
          totalBudgetCents: 4_000, // below the 5_000 already locked
          startsAt: campaign.startsAt,
          endsAt: campaign.endsAt,
        },
      }),
    ).rejects.toMatchObject({ appCode: "BUDGET_BELOW_SPEND" });

    // raising it is fine
    const updated = await caller.campaign.update({
      id: campaign.id,
      data: {
        title: campaign.title,
        status: campaign.status,
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


describe("campaign.list — search escaping", () => {
  it("treats % and _ as literal characters, not wildcards", async () => {
    const caller = await asAdmin();
    await createCampaign({ title: "Summer 50% off" });
    await createCampaign({ title: "Winter clearance" });

    // a bare % would otherwise match everything
    const pct = await caller.campaign.list({
      page: 1,
      pageSize: 10,
      search: "50%",
    });
    expect(pct.items).toHaveLength(1);
    expect(pct.items[0]!.title).toBe("Summer 50% off");

    // "%" alone must match only the title that literally contains it,
    // not every campaign the way an unescaped wildcard would
    const literalPct = await caller.campaign.list({
      page: 1,
      pageSize: 10,
      search: "%",
    });
    expect(literalPct.items).toHaveLength(1);
    expect(literalPct.items[0]!.title).toBe("Summer 50% off");
  });
});

describe("campaign.update — concurrency", () => {
  it("a budget cut racing an approval cannot land below spend", async () => {
    const caller = await asAdmin();
    const creator = await createUser();
    const campaign = await createCampaign({
      payoutPer1kViewsCents: 100,
      totalBudgetCents: 10_000,
    });
    const sub = await createSubmission({
      campaignId: campaign.id,
      creatorId: creator.id,
    });
    await addMetric(sub.id, 50_000); // locks 5_000 on approval

    const { approveSubmission } = await import("@/server/services/approval");
    const base = {
      title: campaign.title,
      status: campaign.status,
      platforms: campaign.platforms,
      payoutPer1kViewsCents: campaign.payoutPer1kViewsCents,
      startsAt: campaign.startsAt,
      endsAt: campaign.endsAt,
    };

    // Cutting the budget to 4_000 and approving 5_000 at the same moment:
    // whichever wins, the campaign must never end up spending over budget.
    const results = await Promise.allSettled([
      approveSubmission(sub.id),
      caller.campaign.update({
        id: campaign.id,
        data: { ...base, totalBudgetCents: 4_000 },
      }),
    ]);

    // Exactly one wins, whichever gets the row lock first: if the approval
    // lands, the budget cut can no longer fit above spend; if the cut lands,
    // the approval no longer fits under the budget.
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const [loser] = results.filter((r) => r.status === "rejected");
    expect(loser).toBeDefined();
    expect(
      ["BUDGET_EXCEEDED", "BUDGET_BELOW_SPEND"],
    ).toContain((loser as PromiseRejectedResult).reason.appCode);

    const { db } = await import("@/db");
    const { campaigns } = await import("@/db/schema");
    const { eq } = await import("drizzle-orm");
    const [after] = await db
      .select()
      .from(campaigns)
      .where(eq(campaigns.id, campaign.id));
    expect(after!.spentCents).toBeLessThanOrEqual(after!.totalBudgetCents);
  });
});
