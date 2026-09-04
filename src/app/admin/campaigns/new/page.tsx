"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { CampaignForm } from "@/components/campaign-form";
import { PageHeader } from "@/components/page-header";
import { useTRPC } from "@/lib/trpc/client";

export default function NewCampaignPage() {
  const trpc = useTRPC();
  const router = useRouter();
  const create = useMutation(
    trpc.campaign.create.mutationOptions({
      onSuccess: (c) => router.push(`/admin/campaigns/${c.id}`),
    }),
  );

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-6 py-6">
      <PageHeader
        title="New campaign"
        description="Amounts are integer cents; the budget caps total payouts."
      />
      <div className="max-w-xl rounded-lg border p-5">
        <CampaignForm
        submitLabel="Create campaign"
        submitting={create.isPending}
        serverError={create.error?.message ?? null}
        onSubmit={(values) => create.mutate(values)}
        />
      </div>
    </main>
  );
}
