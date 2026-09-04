"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";

import { DailyViewsChart } from "@/components/daily-views-chart";
import { ReviewQueue } from "@/components/review-queue";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCents } from "@/lib/money";
import { useTRPC } from "@/lib/trpc/client";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardHeader className="pb-1">
        <CardTitle className="text-sm font-normal text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const trpc = useTRPC();
  const overview = useQuery(trpc.campaign.overview.queryOptions({ id }));

  if (overview.isPending)
    return (
      <main className="mx-auto max-w-4xl space-y-4 p-6" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-4 gap-3">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-56 w-full" />
      </main>
    );
  if (overview.isError)
    return (
      <main className="mx-auto max-w-4xl p-6">
        <p role="alert" className="text-destructive">Campaign not found.</p>
      </main>
    );

  const { campaign, approvedViews, approvedCount, spentCents, remainingCents, daily } =
    overview.data;

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">{campaign.title}</h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="outline">{campaign.status}</Badge>
            {campaign.platforms.join(", ")} · {formatCents(campaign.payoutPer1kViewsCents)} per 1k views ·{" "}
            {campaign.startsAt.toLocaleDateString()} → {campaign.endsAt.toLocaleDateString()}
          </p>
        </div>
        <Button variant="outline" render={<Link href={`/admin/campaigns/${id}/edit`} />}>
          Edit
        </Button>
      </div>

      {campaign.status === "completed" && (
        <p role="status" className="rounded-md border bg-muted px-3 py-2 text-sm">
          Budget fully allocated — this campaign completed automatically.
          Pending submissions can no longer be approved.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Approved views"
          value={approvedViews.toLocaleString()}
          hint={`${approvedCount} approved submission${approvedCount === 1 ? "" : "s"} · still growing`}
        />
        <Stat
          label="Locked at approval"
          value={formatCents(spentCents)}
          hint="Earnings freeze at approval; later view growth doesn't change payouts"
        />
        <Stat label="Remaining budget" value={formatCents(remainingCents)} />
        <Stat label="Total budget" value={formatCents(campaign.totalBudgetCents)} />
      </div>

      <section aria-labelledby="chart-heading" className="space-y-2">
        <h2 id="chart-heading" className="text-lg font-semibold">
          Tracked views per day
        </h2>
        <p className="text-sm text-muted-foreground">
          Whole campaign period — days without a metric sync show as zero.
        </p>
        <DailyViewsChart data={daily} />
      </section>

      <ReviewQueue campaignId={id} />
    </main>
  );
}
