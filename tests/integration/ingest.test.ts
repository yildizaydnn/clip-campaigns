import { and, asc, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

import { db } from "@/db";
import { submissionMetrics } from "@/db/schema";
import { runIngest } from "@/server/services/ingest";
import { addMetric, createCampaign, createSubmission, createUser } from "../helpers/factories";

// A fixed date, deliberately far from the dates the factories seed relative to
// "today". Anchoring the ingest day to a constant while the fixtures move with
// the clock makes the suite pass or fail depending on when it runs.
const DAY = "2030-01-15";

async function approvedSub(views?: number) {
  const creator = await createUser();
  const campaign = await createCampaign();
  const sub = await createSubmission({
    campaignId: campaign.id,
    creatorId: creator.id,
    status: "approved",
    lockedEarningsCents: 0,
  });
  if (views !== undefined) await addMetric(sub.id, views, 1);
  return sub;
}

const rowsFor = (submissionId: string) =>
  db
    .select()
    .from(submissionMetrics)
    .where(eq(submissionMetrics.submissionId, submissionId))
    .orderBy(asc(submissionMetrics.capturedAt));

describe("metric ingest", () => {
  it("tracks pending and approved daily; rejected clips are left alone", async () => {
    const approved = await approvedSub(1_000);
    const creator = await createUser();
    const campaign = await createCampaign();
    const pending = await createSubmission({
      campaignId: campaign.id,
      creatorId: creator.id,
    });
    const rejected = await createSubmission({
      campaignId: campaign.id,
      creatorId: creator.id,
      status: "rejected",
      rejectionReason: "off brief",
    });

    const summary = await runIngest({ day: DAY });
    // pending syncs too: the creator screen needs current views and an
    // estimated earnings figure BEFORE approval (brief 4.3)
    expect(summary).toMatchObject({ written: 2, skipped: 0, failed: [] });

    expect(await rowsFor(rejected.id)).toHaveLength(0);
    expect(
      (await rowsFor(pending.id)).filter((r) => r.capturedAt === DAY),
    ).toHaveLength(1);
    expect(
      (await rowsFor(approved.id)).filter((r) => r.capturedAt === DAY),
    ).toHaveLength(1);
  });

  it("is idempotent: a second run for the same day leaves the data as it was", async () => {
    const sub = await approvedSub(1_000);

    await runIngest({ day: DAY });
    const before = await rowsFor(sub.id);

    // second run fetches wildly different numbers — none of them may land
    const summary = await runIngest({
      day: DAY,
      fetchMetrics: () => ({ views: 999_999, likes: 1, comments: 1 }),
    });
    expect(summary).toMatchObject({ written: 0, skipped: 1 });

    expect(await rowsFor(sub.id)).toEqual(before);
  });

  it("views never go down, even when the source reports fewer", async () => {
    const sub = await approvedSub(50_000); // yesterday: 50k

    const summary = await runIngest({
      day: DAY,
      // source glitches and reports a drop
      fetchMetrics: () => ({ views: 20_000, likes: 5, comments: 1 }),
    });
    expect(summary.written).toBe(1);

    const [todayRow] = await db
      .select()
      .from(submissionMetrics)
      .where(
        and(
          eq(submissionMetrics.submissionId, sub.id),
          eq(submissionMetrics.capturedAt, DAY),
        ),
      );
    expect(todayRow!.views).toBe(50_000); // clamped to the last known value
  });

  it("one blown-up submission doesn't stop the rest, and the failure is reported", async () => {
    const [a, b, c] = await Promise.all([
      approvedSub(1_000),
      approvedSub(2_000),
      approvedSub(3_000),
    ]);

    const summary = await runIngest({
      day: DAY,
      fetchMetrics: ({ id, lastViews }) => {
        if (id === b.id) throw new Error("third-party API exploded");
        return { views: lastViews + 100, likes: 0, comments: 0 };
      },
    });

    expect(summary.written).toBe(2);
    expect(summary.failed).toHaveLength(1);
    expect(summary.failed[0]).toMatchObject({
      submissionId: b.id,
      message: "third-party API exploded",
    });

    expect((await rowsFor(a.id)).some((r) => r.capturedAt === DAY)).toBe(true);
    expect((await rowsFor(c.id)).some((r) => r.capturedAt === DAY)).toBe(true);
    expect((await rowsFor(b.id)).some((r) => r.capturedAt === DAY)).toBe(false);
  });
});
