"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";

import { SubmissionForm } from "@/components/submission-form";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCents } from "@/lib/money";
import { useTRPC } from "@/lib/trpc/client";

export default function CreatorCampaignPage() {
  const { id } = useParams<{ id: string }>();
  const trpc = useTRPC();
  const campaign = useQuery(trpc.campaign.activeById.queryOptions({ id }));

  if (campaign.isPending)
    return (
      <main className="mx-auto max-w-4xl space-y-4 p-6" aria-busy="true">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-48 w-full max-w-lg" />
      </main>
    );
  if (campaign.isError)
    return (
      <main className="mx-auto max-w-4xl p-6">
        <p role="alert" className="text-destructive">
          Campaign not found or no longer active.
        </p>
      </main>
    );

  const c = campaign.data;
  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">{c.title}</h1>
        <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {c.platforms.map((p) => (
            <Badge key={p} variant="outline">{p}</Badge>
          ))}
          <span>
            {formatCents(c.payoutPer1kViewsCents)} per 1,000 views ·{" "}
            {formatCents(c.totalBudgetCents - c.spentCents)} budget left ·{" "}
            {c.startsAt.toLocaleDateString()} → {c.endsAt.toLocaleDateString()}
          </span>
        </p>
      </div>

      <section aria-labelledby="submit-heading" className="space-y-3">
        <h2 id="submit-heading" className="text-lg font-semibold">
          Submit a clip
        </h2>
        <SubmissionForm campaignId={c.id} allowedPlatforms={c.platforms} />
      </section>
    </main>
  );
}
