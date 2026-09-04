"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";

import { PageHeader } from "@/components/page-header";
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
      <main className="mx-auto w-full max-w-6xl space-y-4 px-6 py-6" aria-busy="true">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-48 w-full max-w-lg" />
      </main>
    );
  if (campaign.isError)
    return (
      <main className="mx-auto w-full max-w-6xl px-6 py-6">
        <p role="alert" className="text-destructive">
          Campaign not found or no longer active.
        </p>
      </main>
    );

  const c = campaign.data;
  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-6 py-6">
      <PageHeader
        title={c.title}
        description={`${formatCents(c.payoutPer1kViewsCents)} per 1,000 views · ${formatCents(c.totalBudgetCents - c.spentCents)} budget left · ${c.startsAt.toLocaleDateString()} → ${c.endsAt.toLocaleDateString()}`}
      >
        {c.platforms.map((p) => (
          <Badge key={p} variant="outline">{p}</Badge>
        ))}
      </PageHeader>

      <section
        aria-labelledby="submit-heading"
        className="max-w-xl rounded-lg border p-5"
      >
        <h2 id="submit-heading" className="mb-4 text-base font-semibold">
          Submit a clip
        </h2>
        <SubmissionForm campaignId={c.id} allowedPlatforms={c.platforms} />
      </section>
    </main>
  );
}
