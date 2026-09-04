"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCents } from "@/lib/money";
import { useTRPC } from "@/lib/trpc/client";

export default function CreatorCampaignsPage() {
  const trpc = useTRPC();
  const list = useQuery(trpc.campaign.activeList.queryOptions());

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-6 py-6">
      <PageHeader
        title="Active campaigns"
        description="Pick a campaign, submit your clip, get paid per 1,000 views."
      />

      {list.isPending ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
          {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-44" />)}
        </div>
      ) : list.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Couldn&apos;t load campaigns. {list.error.message}
        </p>
      ) : list.data.length === 0 ? (
        <div className="rounded-lg border border-dashed py-14 text-center">
          <p className="font-medium">No active campaigns right now</p>
          <p className="mt-1 text-sm text-muted-foreground">Check back later.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {list.data.map((c) => (
            <Card key={c.id} className="flex flex-col transition-shadow hover:shadow-md">
              <CardHeader className="pb-2">
                <div className="flex gap-1.5 pb-1">
                  {c.platforms.map((p) => (
                    <Badge key={p} variant="outline">{p}</Badge>
                  ))}
                </div>
                <CardTitle className="text-base leading-snug">{c.title}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col justify-between gap-4 text-sm">
                <div className="space-y-1">
                  <p>
                    <span className="text-xl font-semibold text-primary">
                      {formatCents(c.payoutPer1kViewsCents)}
                    </span>{" "}
                    <span className="text-muted-foreground">per 1,000 views</span>
                  </p>
                  <p className="text-muted-foreground">
                    {formatCents(c.totalBudgetCents - c.spentCents)} budget left · until{" "}
                    {c.endsAt.toLocaleDateString()}
                  </p>
                </div>
                <Button
                  className="w-full"
                  nativeButton={false} render={<Link href={`/creator/campaigns/${c.id}`} />}
                >
                  View &amp; submit
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
