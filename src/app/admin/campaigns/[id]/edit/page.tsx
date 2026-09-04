"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { useParams, useRouter } from "next/navigation";

import { CampaignForm } from "@/components/campaign-form";
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
      <main className="mx-auto max-w-4xl p-6" aria-busy="true">
        <Skeleton className="h-64 w-full max-w-lg" />
      </main>
    );
  if (campaign.isError)
    return (
      <main className="mx-auto max-w-4xl p-6">
        <p role="alert" className="text-destructive">Campaign not found.</p>
      </main>
    );

  const c = campaign.data;
  return (
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">Edit: {c.title}</h1>
      <CampaignForm
        submitLabel="Save changes"
        submitting={update.isPending}
        serverError={update.error?.message ?? null}
        defaultValues={{
          title: c.title,
          platforms: c.platforms,
          payoutPer1kViewsCents: c.payoutPer1kViewsCents,
          totalBudgetCents: c.totalBudgetCents,
          startsAt: c.startsAt,
          endsAt: c.endsAt,
        }}
        onSubmit={(values) => update.mutate({ id, data: values })}
      />
    </main>
  );
}
