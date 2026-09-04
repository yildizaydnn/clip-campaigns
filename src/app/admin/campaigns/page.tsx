"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { formatCents } from "@/lib/money";
import { CAMPAIGN_STATUSES } from "@/lib/schemas/campaign";
import { useTRPC } from "@/lib/trpc/client";
import { useDebouncedValue } from "@/lib/use-debounced-value";

export default function CampaignListPage() {
  const trpc = useTRPC();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string>("");
  const debouncedSearch = useDebouncedValue(search, 300);

  const list = useQuery(
    trpc.campaign.list.queryOptions({
      page,
      pageSize: 10,
      search: debouncedSearch || undefined,
      status: (status || undefined) as
        | (typeof CAMPAIGN_STATUSES)[number]
        | undefined,
    }),
  );

  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Campaigns</h1>
        <Button render={<Link href="/admin/campaigns/new" />}>
          New campaign
        </Button>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="Search by title…"
          aria-label="Search campaigns by title"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="max-w-xs"
        />
        <select
          aria-label="Filter by status"
          className="h-9 rounded-md border bg-background px-2 text-sm"
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
        >
          <option value="">All statuses</option>
          {CAMPAIGN_STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {list.isPending ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : list.isError ? (
        <p role="alert" className="text-sm text-destructive">
          Couldn&apos;t load campaigns. {list.error.message}
        </p>
      ) : list.data.items.length === 0 ? (
        <p className="py-8 text-center text-muted-foreground">
          No campaigns match. Adjust the search or create one.
        </p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Title</TableHead>
                <TableHead scope="col">Status</TableHead>
                <TableHead scope="col">Platforms</TableHead>
                <TableHead scope="col" className="text-right">Payout / 1k</TableHead>
                <TableHead scope="col" className="text-right">Budget</TableHead>
                <TableHead scope="col" className="text-right">Spent</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {list.data.items.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <Link
                      className="font-medium underline-offset-2 hover:underline"
                      href={`/admin/campaigns/${c.id}`}
                    >
                      {c.title}
                    </Link>
                  </TableCell>
                  <TableCell><Badge variant="outline">{c.status}</Badge></TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.platforms.join(", ")}
                  </TableCell>
                  <TableCell className="text-right">{formatCents(c.payoutPer1kViewsCents)}</TableCell>
                  <TableCell className="text-right">{formatCents(c.totalBudgetCents)}</TableCell>
                  <TableCell className="text-right">{formatCents(c.spentCents)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {list.data.total} campaigns · page {list.data.page} of {list.data.pageCount}
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button variant="outline" size="sm" disabled={page >= list.data.pageCount}
                onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
