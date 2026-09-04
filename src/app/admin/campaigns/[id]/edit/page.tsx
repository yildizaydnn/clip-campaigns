"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";

import { CampaignForm } from "@/components/campaign-form";
import { PageHeader } from "@/components/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { useTRPC } from "@/lib/trpc/client";

export default function EditCampaignPage() {
  const { id } = useParams<{ id: string }>();
  const trpc = useTRPC();
  const router = useRouter();

  const campaign = useQuery(trpc.campaign.byId.queryOptions({ id }));
  const update = useMutation(
    trpc.campaign.update.mutationOptions({
      onSuccess: () => router.push(`/admin/campaigns/${id}`),
    }),
  );

  if (campaign.isPending)
    return (
      <main className="mx-auto w-full max-w-6xl px-6 py-6" aria-busy="true">
        <Skeleton className="h-64 w-full max-w-lg" />
      </main>
    );
  if (campaign.isError)
    return (
      <main className="mx-auto w-full max-w-6xl px-6 py-6">
        <p role="alert" className="text-destructive">Campaign not found.</p>
      </main>
    );

  const c = campaign.data;
  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-6 py-6">
      <PageHeader title={`Edit: ${c.title}`} />
      <div className="max-w-xl rounded-lg border p-5">
        <CampaignForm
        submitLabel="Save changes"
        submitting={update.isPending}
        serverError={update.error?.message ?? null}
        defaultValues={{
          title: c.title,
          status: c.status,
          platforms: c.platforms,
          payoutPer1kViewsCents: c.payoutPer1kViewsCents,
          totalBudgetCents: c.totalBudgetCents,
          startsAt: c.startsAt,
          endsAt: c.endsAt,
        }}
        onSubmit={(values) => update.mutate({ id, data: values })}
        />
      </div>
    </main>
  );
}
