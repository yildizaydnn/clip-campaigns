import { describe, expect, it } from "vitest";

import { callerFor } from "../helpers/caller";
import { createCampaign, createUser } from "../helpers/factories";

const DAY = 24 * 60 * 60 * 1000;
const asCreator = async () => {
  const u = await createUser();
  return callerFor({ id: u.id, email: u.email, role: "creator" }).caller;
};
const URL_OK = "https://www.tiktok.com/@someone/video/7311111111111111111";

describe("submission.create — validations in order, all typed", () => {
  it("accepts a valid submission on an active in-window campaign", async () => {
    const caller = await asCreator();
    const campaign = await createCampaign();
    const sub = await caller.submission.create({
      campaignId: campaign.id,
      platform: "tiktok",
      postUrl: URL_OK,
    });
    expect(sub.status).toBe("pending");
  });

  it("rejects a URL that doesn't match the platform shape (zod, field-level)", async () => {
    const caller = await asCreator();
    const campaign = await createCampaign();
    await expect(
      caller.submission.create({
        campaignId: campaign.id,
        platform: "tiktok",
        postUrl: "https://example.com/definitely-not-tiktok",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects inactive campaigns and out-of-window submissions", async () => {
    const caller = await asCreator();
    const paused = await createCampaign({ status: "paused" });
    await expect(
      caller.submission.create({
        campaignId: paused.id, platform: "tiktok", postUrl: URL_OK,
      }),
    ).rejects.toMatchObject({ appCode: "CAMPAIGN_NOT_ACTIVE" });

    const ended = await createCampaign({
      startsAt: new Date(Date.now() - 20 * DAY),
      endsAt: new Date(Date.now() - 10 * DAY),
    });
    await expect(
      caller.submission.create({
        campaignId: ended.id, platform: "tiktok", postUrl: URL_OK,
      }),
    ).rejects.toMatchObject({ appCode: "CAMPAIGN_NOT_IN_WINDOW" });
  });

  it("rejects platforms the campaign doesn't run on", async () => {
    const caller = await asCreator();
    const campaign = await createCampaign({ platforms: ["youtube"] });
    await expect(
      caller.submission.create({
        campaignId: campaign.id, platform: "tiktok", postUrl: URL_OK,
      }),
    ).rejects.toMatchObject({
      appCode: "PLATFORM_NOT_ALLOWED",
      payload: { allowed: ["youtube"] },
    });
  });

  it("refuses the same URL on the same campaign twice — but allows it elsewhere", async () => {
    const caller = await asCreator();
    const campaign = await createCampaign();
    const other = await createCampaign();
    await caller.submission.create({
      campaignId: campaign.id, platform: "tiktok", postUrl: URL_OK,
    });
    await expect(
      caller.submission.create({
        campaignId: campaign.id, platform: "tiktok", postUrl: URL_OK,
      }),
    ).rejects.toMatchObject({ appCode: "DUPLICATE_URL" });
    // same URL, different campaign: fine
    const ok = await caller.submission.create({
      campaignId: other.id, platform: "tiktok", postUrl: URL_OK,
    });
    expect(ok.status).toBe("pending");
  });

  it("mine returns only the caller's rows, frozen vs estimated marked", async () => {
    const alice = await createUser();
    const bob = await createUser();
    const campaign = await createCampaign({ payoutPer1kViewsCents: 100 });
    const { caller: asAlice } = callerFor({ id: alice.id, email: alice.email, role: "creator" });
    const { caller: asBob } = callerFor({ id: bob.id, email: bob.email, role: "creator" });

    await asAlice.submission.create({
      campaignId: campaign.id, platform: "tiktok", postUrl: URL_OK,
    });
    await asBob.submission.create({
      campaignId: campaign.id, platform: "tiktok",
      postUrl: "https://www.tiktok.com/@bob/video/7322222222222222222",
    });

    const mine = await asAlice.submission.mine();
    expect(mine).toHaveLength(1);
    expect(mine[0]!.earningsFrozen).toBe(false);
    expect(mine[0]!.earningsCents).toBe(0); // no metrics yet
  });
});
