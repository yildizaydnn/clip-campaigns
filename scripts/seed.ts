/**
 * Dev seed — wipes and refills the app database. Never run against prod data
 * you care about. Approvals are intentionally NOT seeded with shortcuts that
 * bypass the approval flow, except one consistent, hand-checked example on
 * the completed campaign so the overview screen has data to render.
 */
import { db } from "@/db";
import {
  campaigns,
  submissionMetrics,
  submissions,
  users,
} from "@/db/schema";

const DAY = 24 * 60 * 60 * 1000;
const daysFromNow = (d: number) => new Date(Date.now() + d * DAY);
const dateStr = (d: Date) => d.toISOString().slice(0, 10);

async function main() {
  // FK order: metrics -> submissions -> campaigns/users
  await db.delete(submissionMetrics);
  await db.delete(submissions);
  await db.delete(campaigns);
  await db.delete(users);

  const [admin, c1, c2, c3] = await db
    .insert(users)
    .values([
      { email: "admin@example.com", role: "admin" },
      { email: "creator1@example.com", role: "creator" },
      { email: "creator2@example.com", role: "creator" },
      { email: "creator3@example.com", role: "creator" },
    ])
    .returning();

  const [summer, shorts, draft, paused, done] = await db
    .insert(campaigns)
    .values([
      {
        title: "Summer Drop — TikTok & Reels",
        platforms: ["tiktok", "instagram"],
        payoutPer1kViewsCents: 150, // $1.50 per 1k views
        totalBudgetCents: 100_000, // $1,000
        status: "active",
        startsAt: daysFromNow(-10),
        endsAt: daysFromNow(20),
      },
      {
        title: "Product Launch Shorts",
        platforms: ["youtube"],
        payoutPer1kViewsCents: 200,
        totalBudgetCents: 50_000,
        status: "active",
        startsAt: daysFromNow(-5),
        endsAt: daysFromNow(25),
      },
      {
        title: "Holiday Teaser (draft)",
        platforms: ["tiktok"],
        payoutPer1kViewsCents: 100,
        totalBudgetCents: 30_000,
        status: "draft",
        startsAt: daysFromNow(30),
        endsAt: daysFromNow(60),
      },
      {
        title: "Spring Awareness (paused)",
        platforms: ["instagram", "youtube"],
        payoutPer1kViewsCents: 120,
        totalBudgetCents: 40_000,
        status: "paused",
        startsAt: daysFromNow(-20),
        endsAt: daysFromNow(10),
      },
      {
        // Fully spent campaign. Numbers are hand-checked to satisfy the
        // invariant spent_cents == SUM(locked_earnings_cents):
        // floor(12_000 views / 1000) * 2000 = 24_000 == total budget.
        title: "Retro Launch (completed)",
        platforms: ["tiktok"],
        payoutPer1kViewsCents: 2_000,
        totalBudgetCents: 24_000,
        spentCents: 24_000,
        status: "completed",
        startsAt: daysFromNow(-40),
        endsAt: daysFromNow(-10),
      },
    ])
    .returning();

  if (!admin || !c1 || !c2 || !c3 || !summer || !shorts || !draft || !paused || !done)
    throw new Error("seed insert returned fewer rows than expected");

  const subs = await db
    .insert(submissions)
    .values([
      // pending queue on the active campaigns — approvals happen in the app
      {
        campaignId: summer.id,
        creatorId: c1.id,
        postUrl: "https://www.tiktok.com/@creator1/video/7300000000000000001",
        platform: "tiktok",
      },
      {
        campaignId: summer.id,
        creatorId: c2.id,
        postUrl: "https://www.instagram.com/reel/Cx1AbCdEfGh/",
        platform: "instagram",
      },
      {
        campaignId: summer.id,
        creatorId: c2.id,
        postUrl: "https://www.tiktok.com/@creator2/video/7300000000000000002",
        platform: "tiktok",
      },
      {
        campaignId: shorts.id,
        creatorId: c3.id,
        postUrl: "https://www.youtube.com/shorts/dQw4w9WgXcQ",
        platform: "youtube",
      },
      // the one seeded approval, matching the completed campaign's numbers
      {
        campaignId: done.id,
        creatorId: c1.id,
        postUrl: "https://www.tiktok.com/@creator1/video/7200000000000000009",
        platform: "tiktok",
        status: "approved",
        lockedEarningsCents: 24_000,
        reviewedAt: daysFromNow(-12),
      },
    ])
    .returning();

  const approved = subs[4];
  if (!approved) throw new Error("expected the seeded approved submission");

  // a few days of metric history for the approved clip (views only go up)
  await db.insert(submissionMetrics).values(
    [
      { day: -15, views: 4_200, likes: 310, comments: 25 },
      { day: -14, views: 7_900, likes: 640, comments: 51 },
      { day: -13, views: 11_050, likes: 890, comments: 77 },
      { day: -12, views: 12_000, likes: 940, comments: 81 },
    ].map((m) => ({
      submissionId: approved.id,
      capturedAt: dateStr(daysFromNow(m.day)),
      views: m.views,
      likes: m.likes,
      comments: m.comments,
    })),
  );

  console.log(
    `seeded: ${[admin, c1, c2, c3].length} users, 5 campaigns, ${subs.length} submissions, 4 metric rows`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
