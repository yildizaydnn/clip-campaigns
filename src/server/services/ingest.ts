import { desc, eq, ne } from "drizzle-orm";

import { db } from "@/db";
import { submissionMetrics, submissions } from "@/db/schema";

/**
 * Daily metric sync. In production the numbers come from third-party APIs;
 * here the fetcher is injectable — the default fakes plausible growth, and
 * tests inject fetchers that shrink or throw to prove monotonicity and
 * failure isolation.
 *
 * Guarantees, each carried by a distinct mechanism:
 * - one row per tracked submission per day   -> composite PK
 * - running twice for the same day changes nothing -> ON CONFLICT DO NOTHING
 * - views only ever go up                    -> max(last, fetched) before insert
 * - one failure doesn't stop the run         -> per-submission try/catch
 */

export type FetchedMetrics = { views: number; likes: number; comments: number };
export type MetricsFetcher = (sub: {
  id: string;
  lastViews: number;
}) => Promise<FetchedMetrics> | FetchedMetrics;

const fakeFetcher: MetricsFetcher = ({ lastViews }) => {
  const growth = Math.floor(Math.random() * 4000) + 50;
  return {
    views: lastViews + growth,
    likes: Math.floor((lastViews + growth) * 0.07),
    comments: Math.floor((lastViews + growth) * 0.005),
  };
};

export type IngestSummary = {
  day: string;
  total: number;
  written: number;
  skipped: number;
  failed: { submissionId: string; message: string }[];
};

export async function runIngest(opts?: {
  day?: string; // YYYY-MM-DD, defaults to today (UTC)
  fetchMetrics?: MetricsFetcher;
}): Promise<IngestSummary> {
  const day = opts?.day ?? new Date().toISOString().slice(0, 10);
  const fetchMetrics = opts?.fetchMetrics ?? fakeFetcher;

  // Pending submissions sync too — the creator screen shows "current views
  // and estimated earnings" (brief 4.3), which needs view counts before
  // approval, and approving with a metric history locks a real amount
  // instead of zero. Only rejected clips stop being tracked.
  const targets = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(ne(submissions.status, "rejected"));

  const summary: IngestSummary = {
    day,
    total: targets.length,
    written: 0,
    skipped: 0,
    failed: [],
  };

  for (const { id } of targets) {
    try {
      const [last] = await db
        .select({ views: submissionMetrics.views })
        .from(submissionMetrics)
        .where(eq(submissionMetrics.submissionId, id))
        .orderBy(desc(submissionMetrics.capturedAt))
        .limit(1);
      const lastViews = last?.views ?? 0;

      const fetched = await fetchMetrics({ id, lastViews });

      const inserted = await db
        .insert(submissionMetrics)
        .values({
          submissionId: id,
          capturedAt: day,
          // a third-party API glitch may report fewer views than yesterday;
          // views never go down, so clamp against the last known value
          views: Math.max(lastViews, fetched.views),
          likes: fetched.likes,
          comments: fetched.comments,
        })
        // same day already ingested -> leave the data exactly as it was
        .onConflictDoNothing({
          target: [submissionMetrics.submissionId, submissionMetrics.capturedAt],
        })
        .returning({ submissionId: submissionMetrics.submissionId });

      if (inserted.length > 0) summary.written++;
      else summary.skipped++;
    } catch (e) {
      // isolate the blast radius: record and continue with the rest
      summary.failed.push({
        submissionId: id,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return summary;
}
