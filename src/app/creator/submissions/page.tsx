"use client";

import { useQuery } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatCents } from "@/lib/money";
import { useTRPC } from "@/lib/trpc/client";

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "outline",
  approved: "default",
  paid: "secondary",
  rejected: "destructive",
};

export default function MySubmissionsPage() {
  const trpc = useTRPC();
  const mine = useQuery(trpc.submission.mine.queryOptions());

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">My submissions</h1>

      {mine.isPending ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-10" />)}
        </div>
      ) : mine.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Couldn&apos;t load your submissions.
        </p>
      ) : mine.data.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">
          Nothing yet — browse the active campaigns and submit a clip.
        </p>
      ) : (
        <Table>
          <TableHeader>
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
              <TableRow key={s.id}>
                <TableCell className="font-medium">{s.campaignTitle}</TableCell>
                <TableCell>
                  <a href={s.postUrl} target="_blank" rel="noreferrer"
                     className="text-muted-foreground underline-offset-2 hover:underline">
                    {s.platform} ↗
                  </a>
                </TableCell>
                <TableCell>
                  <Badge variant={STATUS_VARIANT[s.status] ?? "outline"}>{s.status}</Badge>
                  {s.status === "rejected" && s.rejectionReason && (
                    <p className="mt-1 max-w-56 text-xs text-muted-foreground">
                      {s.rejectionReason}
                    </p>
                  )}
                </TableCell>
                <TableCell className="text-right">{s.views.toLocaleString()}</TableCell>
                <TableCell className="text-right">
                  <span className="tabular-nums">{formatCents(s.earningsCents)}</span>
                  <span className="ml-1 text-xs text-muted-foreground">
                    {s.earningsFrozen ? "final" : "est."}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </main>
  );
}
