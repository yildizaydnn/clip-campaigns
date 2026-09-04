"use client";

import { useQuery } from "@tanstack/react-query";
import { Eye, Lock, PiggyBank, Wallet } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

import { DailyViewsChart } from "@/components/daily-views-chart";
import { PageHeader } from "@/components/page-header";
import { ReviewQueue } from "@/components/review-queue";
import { CampaignStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCents } from "@/lib/money";
import { useTRPC } from "@/lib/trpc/client";

function Stat({
  label, value, hint, icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-4">
        <div className="rounded-md bg-primary/10 p-2 text-primary">
          <Icon className="size-4" aria-hidden />
        </div>
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-0.5 text-2xl font-semibold tabular-nums tracking-tight">
            {value}
          </p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
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
      <main className="mx-auto w-full max-w-6xl space-y-6 px-6 py-6" aria-busy="true">
        <Skeleton className="h-16 w-full" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-56 w-full" />
      </main>
    );
  if (overview.isError)
    return (
      <main className="mx-auto w-full max-w-6xl px-6 py-6">
        <p role="alert" className="text-destructive">Campaign not found.</p>
      </main>
    );

  const { campaign, approvedViews, approvedCount, spentCents, remainingCents, daily } =
    overview.data;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-6 py-6">
      <PageHeader
        title={campaign.title}
        description={`${campaign.platforms.join(", ")} · ${formatCents(campaign.payoutPer1kViewsCents)} per 1,000 views · ${campaign.startsAt.toLocaleDateString()} → ${campaign.endsAt.toLocaleDateString()}`}
      >
        <CampaignStatusBadge status={campaign.status} />
        <Button variant="outline" nativeButton={false} render={<Link href={`/admin/campaigns/${id}/edit`} />}>
          Edit
        </Button>
      </PageHeader>

      {campaign.status === "completed" && (
        <p role="status" className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-400">
          Budget fully allocated — this campaign completed automatically.
          Pending submissions can no longer be approved.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          icon={Eye}
          label="Approved views"
          value={approvedViews.toLocaleString("en-US")}
          hint={`${approvedCount} approved submission${approvedCount === 1 ? "" : "s"} · still growing`}
        />
        <Stat
          icon={Lock}
          label="Locked at approval"
          value={formatCents(spentCents)}
          hint="Earnings freeze at approval; later view growth doesn't change payouts"
        />
        <Stat icon={Wallet} label="Remaining budget" value={formatCents(remainingCents)} />
        <Stat icon={PiggyBank} label="Total budget" value={formatCents(campaign.totalBudgetCents)} />
      </div>

      <section aria-labelledby="chart-heading" className="rounded-lg border p-4">
        <h2 id="chart-heading" className="text-base font-semibold">
          Tracked views per day
        </h2>
        <p className="mb-3 text-sm text-muted-foreground">
          Whole campaign period — days without a metric sync show as zero.
        </p>
        <DailyViewsChart data={daily} />
      </section>

      <ReviewQueue campaignId={id} />
    </main>
  );
}
