"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatCents } from "@/lib/money";
import { useTRPC } from "@/lib/trpc/client";

export function ReviewQueue({ campaignId }: { campaignId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  const queue = useQuery(
    trpc.campaign.reviewQueue.queryOptions({ campaignId }),
  );

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: trpc.campaign.reviewQueue.queryKey({ campaignId }),
      }),
      queryClient.invalidateQueries({
        queryKey: trpc.campaign.overview.queryKey({ id: campaignId }),
      }),
    ]);

  const approve = useMutation(
    trpc.submission.approve.mutationOptions({
      onSuccess: () => { setActionError(null); void refresh(); },
      onError: (e) => {
        const data = e.data as
          | { appCode?: string | null; appPayload?: { remainingCents?: number; requiredCents?: number } | null }
          | undefined;
        if (data?.appCode === "BUDGET_EXCEEDED" && data.appPayload) {
          setActionError(
            `Budget exceeded: this approval needs ${formatCents(data.appPayload.requiredCents ?? 0)}, but only ${formatCents(data.appPayload.remainingCents ?? 0)} remains.`,
          );
        } else if (data?.appCode === "ALREADY_REVIEWED") {
          setActionError("Already reviewed by someone else — list refreshed.");
        } else if (data?.appCode === "CAMPAIGN_NOT_ACTIVE") {
          setActionError("This campaign is no longer active.");
        } else {
          setActionError(e.message);
        }
        void refresh();
      },
    }),
  );

  const reject = useMutation(
    trpc.submission.reject.mutationOptions({
      onSuccess: () => {
        setRejecting(null); setReason(""); setActionError(null); void refresh();
      },
      onError: (e) => setActionError(e.message),
    }),
  );

  if (queue.isPending)
    return <Skeleton className="h-32 w-full" aria-busy="true" />;
  if (queue.isError)
    return (
      <p role="alert" className="text-sm text-destructive">
        Couldn&apos;t load the review queue.
      </p>
    );

  return (
    <section aria-labelledby="queue-heading" className="space-y-3">
      <h2 id="queue-heading" className="text-lg font-semibold">
        Review queue{" "}
        <span className="text-sm font-normal text-muted-foreground">
          ({queue.data.length} pending)
        </span>
      </h2>

      {actionError && (
        <p role="alert" aria-live="polite" className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {actionError}
        </p>
      )}

      {queue.data.length === 0 ? (
        <div className="rounded-lg border border-dashed py-10 text-center text-sm text-muted-foreground">
          Nothing waiting for review.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead scope="col">Creator</TableHead>
              <TableHead scope="col">Post</TableHead>
              <TableHead scope="col" className="text-right">Views</TableHead>
              <TableHead scope="col" className="text-right">Est. earnings</TableHead>
              <TableHead scope="col" className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {queue.data.map((s) => (
              <TableRow key={s.id}>
                <TableCell>{s.creatorEmail}</TableCell>
                <TableCell>
                  <a href={s.postUrl} target="_blank" rel="noreferrer"
                     className="text-muted-foreground underline-offset-2 hover:underline">
                    {s.platform} ↗
                  </a>
                </TableCell>
                <TableCell className="text-right">{s.views.toLocaleString()}</TableCell>
                <TableCell className="text-right">{formatCents(s.estimatedEarningsCents)}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button size="sm" disabled={approve.isPending}
                      onClick={() => approve.mutate({ submissionId: s.id })}>
                      Approve
                    </Button>
                    <Button size="sm" variant="outline" disabled={reject.isPending}
                      onClick={() => { setRejecting(s.id); setReason(""); }}>
                      Reject
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        </div>
      )}

      <Dialog open={rejecting !== null} onOpenChange={(o) => !o && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject submission</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="reject-reason">Reason (required)</Label>
            <Textarea
              id="reject-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Tell the creator why this clip was rejected…"
            />
            {reject.isError && (
              <p role="alert" className="text-sm text-destructive">{reject.error.message}</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>Cancel</Button>
            <Button
              disabled={reject.isPending || reason.trim().length < 3}
              onClick={() => rejecting && reject.mutate({ submissionId: rejecting, reason })}
            >
              {reject.isPending ? "Rejecting…" : "Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
