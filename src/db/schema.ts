import { relations, sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const userRole = pgEnum("user_role", ["admin", "creator"]);
export const platform = pgEnum("platform", ["tiktok", "instagram", "youtube"]);
export const campaignStatus = pgEnum("campaign_status", [
  "draft",
  "active",
  "paused",
  "completed",
]);
// `paid` exists in the data model as required; no flow transitions to it —
// that is a real payout-provider concern and out of scope (see NOTES.md).
export const submissionStatus = pgEnum("submission_status", [
  "pending",
  "approved",
  "rejected",
  "paid",
]);

// ---------------------------------------------------------------------------
// Tables — all money columns are integer cents; no float arithmetic anywhere.
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(),
  role: userRole("role").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const campaigns = pgTable(
  "campaigns",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    title: text("title").notNull(),
    platforms: platform("platforms").array().notNull(),
    payoutPer1kViewsCents: integer("payout_per_1k_views_cents").notNull(),
    totalBudgetCents: integer("total_budget_cents").notNull(),
    /**
     * Denormalized: always equals SUM(locked_earnings_cents) of approved/paid
     * submissions. Kept as a column so the approval flow can enforce the
     * budget ceiling with a single conditional UPDATE — the row lock plus
     * WHERE re-evaluation under READ COMMITTED is what serializes concurrent
     * approvals. An invariant test guards the equality.
     */
    spentCents: integer("spent_cents").notNull().default(0),
    status: campaignStatus("status").notNull().default("draft"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // list screen: filter by status, newest first, paginated server-side
    index("campaigns_status_created_idx").on(t.status, t.createdAt.desc()),
    check("campaigns_payout_positive", sql`${t.payoutPer1kViewsCents} > 0`),
    check("campaigns_budget_positive", sql`${t.totalBudgetCents} > 0`),
    // Last line of defence for "a campaign never pays out more than
    // total_budget": even a buggy code path cannot push spend past the cap.
    check(
      "campaigns_spent_within_budget",
      sql`${t.spentCents} >= 0 AND ${t.spentCents} <= ${t.totalBudgetCents}`,
    ),
    check("campaigns_window_valid", sql`${t.endsAt} > ${t.startsAt}`),
  ],
);

export const submissions = pgTable(
  "submissions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    campaignId: uuid("campaign_id")
      .notNull()
      .references(() => campaigns.id, { onDelete: "restrict" }),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    postUrl: text("post_url").notNull(),
    platform: platform("platform").notNull(),
    status: submissionStatus("status").notNull().default("pending"),
    rejectionReason: text("rejection_reason"),
    /**
     * Earnings are computed and frozen at approval time (decision: the payout
     * race is settled once, in one transaction). Null until approved.
     */
    lockedEarningsCents: integer("locked_earnings_cents"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    // "the same URL can't end up on the same campaign twice" — enforced here,
    // not in application code
    uniqueIndex("submissions_campaign_url_unique").on(t.campaignId, t.postUrl),
    // review queue: pending submissions of one campaign
    index("submissions_campaign_status_idx").on(t.campaignId, t.status),
    // "my submissions", newest first
    index("submissions_creator_created_idx").on(
      t.creatorId,
      t.createdAt.desc(),
    ),
    check(
      "submissions_rejection_reason_required",
      sql`${t.status} <> 'rejected' OR ${t.rejectionReason} IS NOT NULL`,
    ),
    check(
      "submissions_locked_earnings_when_approved",
      sql`${t.status} NOT IN ('approved', 'paid') OR ${t.lockedEarningsCents} IS NOT NULL`,
    ),
  ],
);

export const submissionMetrics = pgTable(
  "submission_metrics",
  {
    submissionId: uuid("submission_id")
      .notNull()
      .references(() => submissions.id, { onDelete: "cascade" }),
    capturedAt: date("captured_at").notNull(),
    views: integer("views").notNull(),
    likes: integer("likes").notNull().default(0),
    comments: integer("comments").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    // "one row per submission per day" — the natural key IS the primary key.
    // It also backs idempotent ingest (ON CONFLICT DO NOTHING) and, scanned
    // backwards, "latest metric per submission" — no extra index needed.
    primaryKey({ columns: [t.submissionId, t.capturedAt] }),
    check("metrics_views_nonnegative", sql`${t.views} >= 0`),
  ],
);

// ---------------------------------------------------------------------------
// Relations
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  submissions: many(submissions),
}));

export const campaignsRelations = relations(campaigns, ({ many }) => ({
  submissions: many(submissions),
}));

export const submissionsRelations = relations(submissions, ({ one, many }) => ({
  campaign: one(campaigns, {
    fields: [submissions.campaignId],
    references: [campaigns.id],
  }),
  creator: one(users, {
    fields: [submissions.creatorId],
    references: [users.id],
  }),
  metrics: many(submissionMetrics),
}));

export const submissionMetricsRelations = relations(
  submissionMetrics,
  ({ one }) => ({
    submission: one(submissions, {
      fields: [submissionMetrics.submissionId],
      references: [submissions.id],
    }),
  }),
);
