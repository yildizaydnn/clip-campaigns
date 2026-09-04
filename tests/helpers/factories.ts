import { db } from "@/db";
import { campaigns, submissions, users } from "@/db/schema";

const DAY = 24 * 60 * 60 * 1000;
let seq = 0;
const uniq = () => `${Date.now().toString(36)}-${seq++}`;

type UserOverrides = Partial<typeof users.$inferInsert>;
type CampaignOverrides = Partial<typeof campaigns.$inferInsert>;
type SubmissionOverrides = Partial<typeof submissions.$inferInsert>;

export async function createUser(overrides: UserOverrides = {}) {
  const [row] = await db
    .insert(users)
    .values({
      email: `user-${uniq()}@example.com`,
      role: "creator",
      ...overrides,
    })
    .returning();
  if (!row) throw new Error("createUser: insert returned no row");
  return row;
}

export async function createCampaign(overrides: CampaignOverrides = {}) {
  const [row] = await db
    .insert(campaigns)
    .values({
      title: `Campaign ${uniq()}`,
      platforms: ["tiktok"],
      payoutPer1kViewsCents: 100,
      totalBudgetCents: 100_000,
      status: "active",
      startsAt: new Date(Date.now() - 10 * DAY),
      endsAt: new Date(Date.now() + 10 * DAY),
      ...overrides,
    })
    .returning();
  if (!row) throw new Error("createCampaign: insert returned no row");
  return row;
}

export async function createSubmission(
  args: { campaignId: string; creatorId: string } & SubmissionOverrides,
) {
  const [row] = await db
    .insert(submissions)
    .values({
      postUrl: `https://www.tiktok.com/@user/video/7${uniq().replace(/\D/g, "0").padEnd(18, "0")}`,
      platform: "tiktok",
      ...args,
    })
    .returning();
  if (!row) throw new Error("createSubmission: insert returned no row");
  return row;
}
