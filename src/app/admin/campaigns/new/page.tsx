"use client";

import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { CampaignForm } from "@/components/campaign-form";
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
    <main className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-xl font-semibold">New campaign</h1>
      <CampaignForm
        submitLabel="Create campaign"
        submitting={create.isPending}
        serverError={create.error?.message ?? null}
        onSubmit={(values) => create.mutate(values)}
      />
    </main>
  );
}
