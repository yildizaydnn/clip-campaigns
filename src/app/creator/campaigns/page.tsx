"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatCents } from "@/lib/money";
import { useTRPC } from "@/lib/trpc/client";

export default function CreatorCampaignsPage() {
  const trpc = useTRPC();
  const list = useQuery(trpc.campaign.activeList.queryOptions());

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Active campaigns</h1>

      {list.isPending ? (
        <div className="grid gap-3 sm:grid-cols-2" aria-busy="true">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-36" />)}
        </div>
      ) : list.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Couldn&apos;t load campaigns. {list.error.message}
        </p>
      ) : list.data.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">
          No active campaigns right now — check back later.
        </p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {list.data.map((c) => (
            <Card key={c.id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  <Link href={`/creator/campaigns/${c.id}`}
                        className="underline-offset-2 hover:underline">
                    {c.title}
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex gap-1.5">
                  {c.platforms.map((p) => (
                    <Badge key={p} variant="outline">{p}</Badge>
                  ))}
                </div>
                <p>
                  <span className="font-medium">{formatCents(c.payoutPer1kViewsCents)}</span>{" "}
                  <span className="text-muted-foreground">per 1,000 views</span>
                </p>
                <p className="text-muted-foreground">
                  {formatCents(c.totalBudgetCents - c.spentCents)} budget left ·
                  until {c.endsAt.toLocaleDateString()}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </main>
  );
}
