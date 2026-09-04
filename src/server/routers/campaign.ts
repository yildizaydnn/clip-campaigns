import { and, desc, eq, ilike, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { campaigns } from "@/db/schema";
import {
  createCampaignSchema,
  listCampaignsSchema,
  updateCampaignSchema,
} from "@/lib/schemas/campaign";
import { calculateEarningsCents } from "@/server/services/payout";
import { adminProcedure, creatorProcedure, router } from "../trpc";

export const campaignRouter = router({
  /** Server-side pagination, title search and status filter — per the brief. */
  list: adminProcedure
    .input(listCampaignsSchema)
    .query(async ({ ctx, input }) => {
      const where = and(
        input.status ? eq(campaigns.status, input.status) : undefined,
        input.search ? ilike(campaigns.title, `%${input.search}%`) : undefined,
      );
      const [items, counted] = await Promise.all([
        ctx.db
          .select()
          .from(campaigns)
          .where(where)
          .orderBy(desc(campaigns.createdAt))
          .limit(input.pageSize)
          .offset((input.page - 1) * input.pageSize),
        ctx.db
          .select({ count: sql<number>`count(*)::int` })
          .from(campaigns)
          .where(where),
      ]);
      const total = counted[0]?.count ?? 0;
      return {
        items,
        total,
        page: input.page,
        pageCount: Math.max(1, Math.ceil(total / input.pageSize)),
      };
    }),

  /** Creator browse: active campaigns with rate and remaining budget. */
  activeList: creatorProcedure.query(({ ctx }) =>
    ctx.db
      .select({
        id: campaigns.id,
        title: campaigns.title,
        platforms: campaigns.platforms,
        payoutPer1kViewsCents: campaigns.payoutPer1kViewsCents,
        totalBudgetCents: campaigns.totalBudgetCents,
        spentCents: campaigns.spentCents,
        startsAt: campaigns.startsAt,
        endsAt: campaigns.endsAt,
      })
      .from(campaigns)
      .where(eq(campaigns.status, "active"))
      .orderBy(desc(campaigns.createdAt)),
  ),

  activeById: creatorProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select()
        .from(campaigns)
        .where(and(eq(campaigns.id, input.id), eq(campaigns.status, "active")));
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  byId: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, input.id));
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  create: adminProcedure
    .input(createCampaignSchema)
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db.insert(campaigns).values(input).returning();
      return row!;
    }),

  update: adminProcedure
    .input(updateCampaignSchema)
    .mutation(async ({ ctx, input }) => {
      const [current] = await ctx.db
        .select({ spentCents: campaigns.spentCents })
        .from(campaigns)
        .where(eq(campaigns.id, input.id));
      if (!current) throw new TRPCError({ code: "NOT_FOUND" });
      // don't let the DB check constraint be the messenger: a budget below
      // what's already locked in is a user error with a readable answer
      if (input.data.totalBudgetCents < current.spentCents)
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Budget can't go below what's already locked in (${current.spentCents} cents).`,
        });
      const [row] = await ctx.db
        .update(campaigns)
        .set(input.data)
        .where(eq(campaigns.id, input.id))
        .returning();
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  /**
   * Overview numbers + the daily views series. Two deliberate choices:
   * - "budget spent" is spent_cents (earnings frozen at approval), shown
   *   next to live approved views — the two won't reconcile by mental math
   *   and the UI says why (earnings lock at approval time).
   * - the series is generated with generate_series on the SERVER, so days
   *   without metrics arrive as explicit zeros; the client never gap-fills.
   */
  overview: adminProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [campaign] = await ctx.db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, input.id));
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });

      const totalsRows = await ctx.db.execute(sql`
        SELECT COALESCE(SUM(latest.views), 0)::int AS approved_views,
               COUNT(latest.submission_id)::int    AS approved_count
        FROM (
          SELECT DISTINCT ON (m.submission_id) m.submission_id, m.views
          FROM submission_metrics m
          JOIN submissions s ON s.id = m.submission_id
          WHERE s.campaign_id = ${input.id}
            AND s.status IN ('approved', 'paid')
          ORDER BY m.submission_id, m.captured_at DESC
        ) latest
      `);
      const totals = totalsRows[0] as
        | { approved_views: number; approved_count: number }
        | undefined;

      const daily = (await ctx.db.execute(sql`
        SELECT to_char(g.d, 'YYYY-MM-DD') AS day,
               COALESCE(SUM(m.views), 0)::int AS views
        FROM generate_series(
          ${campaign.startsAt.toISOString().slice(0, 10)}::date,
          ${campaign.endsAt.toISOString().slice(0, 10)}::date,
          interval '1 day'
        ) AS g(d)
        LEFT JOIN submissions s
          ON s.campaign_id = ${input.id} AND s.status IN ('approved', 'paid')
        LEFT JOIN submission_metrics m
          ON m.submission_id = s.id AND m.captured_at = g.d::date
        GROUP BY g.d
        ORDER BY g.d
      `)) as unknown as { day: string; views: number }[];

      return {
        campaign,
        approvedViews: totals?.approved_views ?? 0,
        approvedCount: totals?.approved_count ?? 0,
        spentCents: campaign.spentCents,
        remainingCents: campaign.totalBudgetCents - campaign.spentCents,
        daily,
      };
    }),

  /** Pending submissions with the numbers an admin needs to decide. */
  reviewQueue: adminProcedure
    .input(z.object({ campaignId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [campaign] = await ctx.db
        .select()
        .from(campaigns)
        .where(eq(campaigns.id, input.campaignId));
      if (!campaign) throw new TRPCError({ code: "NOT_FOUND" });

      const rows = (await ctx.db.execute(sql`
        SELECT s.id, s.post_url, s.platform, s.created_at, u.email,
               COALESCE((
                 SELECT m.views FROM submission_metrics m
                 WHERE m.submission_id = s.id
                 ORDER BY m.captured_at DESC LIMIT 1
               ), 0)::int AS views
        FROM submissions s
        JOIN users u ON u.id = s.creator_id
        WHERE s.campaign_id = ${input.campaignId} AND s.status = 'pending'
        ORDER BY s.created_at ASC
      `)) as unknown as {
        id: string;
        post_url: string;
        platform: string;
        created_at: string;
        email: string;
        views: number;
      }[];

      return rows.map((r) => ({
        id: r.id,
        postUrl: r.post_url,
        platform: r.platform,
        createdAt: r.created_at,
        creatorEmail: r.email,
        views: r.views,
        estimatedEarningsCents: calculateEarningsCents(
          r.views,
          campaign.payoutPer1kViewsCents,
        ),
      }));
    }),
});
