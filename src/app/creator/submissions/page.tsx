"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { SubmissionStatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatCents } from "@/lib/money";
import { useTRPC } from "@/lib/trpc/client";

export default function MySubmissionsPage() {
  const trpc = useTRPC();
  const mine = useQuery(trpc.submission.mine.queryOptions());

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-6 py-6">
      <PageHeader
        title="My submissions"
        description="Estimated earnings update daily; they lock in when a clip is approved."
      />

      {mine.isPending ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-11" />)}
        </div>
      ) : mine.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Couldn&apos;t load your submissions.
        </p>
      ) : mine.data.length === 0 ? (
        <div className="rounded-lg border border-dashed py-14 text-center">
          <p className="font-medium">Nothing here yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse the active campaigns and submit your first clip.
          </p>
          <Button className="mt-4" nativeButton={false} render={<Link href="/creator/campaigns" />}>
            Browse campaigns
          </Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead scope="col">Campaign</TableHead>
                <TableHead scope="col">Post</TableHead>
                <TableHead scope="col">Status</TableHead>
                <TableHead scope="col" className="text-right">Views</TableHead>
                <TableHead scope="col" className="text-right">Earnings</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mine.data.map((s) => (
                <TableRow key={s.id} className="hover:bg-muted/40">
                  <TableCell className="font-medium">{s.campaignTitle}</TableCell>
                  <TableCell>
                    <a href={s.postUrl} target="_blank" rel="noreferrer"
                       className="text-primary underline-offset-2 hover:underline">
                      {s.platform} ↗
                    </a>
                  </TableCell>
                  <TableCell>
                    <SubmissionStatusBadge status={s.status} />
                    {s.status === "rejected" && s.rejectionReason && (
                      <p className="mt-1 max-w-56 text-xs text-muted-foreground">
                        {s.rejectionReason}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {s.views.toLocaleString("en-US")}
                  </TableCell>
                  <TableCell className="text-right">
                    <span className="font-medium tabular-nums">{formatCents(s.earningsCents)}</span>
                    <span className="ml-1 text-xs text-muted-foreground">
                      {s.earningsFrozen ? "final" : "est."}
                    </span>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </main>
  );
}
