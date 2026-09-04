"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  campaignFormSchema,
  PLATFORMS,
  type CampaignFormValues,
} from "@/lib/schemas/campaign";

const toDateInput = (d: Date) => d.toISOString().slice(0, 10);

export function CampaignForm({
  defaultValues,
  onSubmit,
  submitting,
  submitLabel,
  serverError,
}: {
  defaultValues?: Partial<CampaignFormValues>;
  onSubmit: (values: CampaignFormValues) => void;
  submitting: boolean;
  submitLabel: string;
  serverError?: string | null;
}) {
  const form = useForm<CampaignFormValues>({
    resolver: zodResolver(campaignFormSchema),
    defaultValues,
  });
  const { errors } = form.formState;

  const field = (name: keyof CampaignFormValues) =>
    errors[name] ? (
      <p id={`${name}-error`} role="alert" className="text-sm text-destructive">
        {errors[name]?.message as string}
      </p>
    ) : null;

  return (
    <form
      onSubmit={form.handleSubmit(onSubmit)}
      className="max-w-lg space-y-4"
      noValidate
    >
      <div className="space-y-1.5">
        <Label htmlFor="title">Title</Label>
        <Input
          id="title"
          aria-invalid={!!errors.title}
          aria-describedby={errors.title ? "title-error" : undefined}
          {...form.register("title")}
        />
        {field("title")}
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Platforms</legend>
        <div className="flex gap-4">
          {PLATFORMS.map((p) => (
            <label key={p} className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" value={p} {...form.register("platforms")} />
              {p}
            </label>
          ))}
        </div>
        {field("platforms")}
      </fieldset>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="payout">Payout per 1k views (cents)</Label>
          <Input
            id="payout"
            type="number"
            inputMode="numeric"
            aria-invalid={!!errors.payoutPer1kViewsCents}
            {...form.register("payoutPer1kViewsCents", { valueAsNumber: true })}
          />
          {field("payoutPer1kViewsCents")}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="budget">Total budget (cents)</Label>
          <Input
            id="budget"
            type="number"
            inputMode="numeric"
            aria-invalid={!!errors.totalBudgetCents}
            {...form.register("totalBudgetCents", { valueAsNumber: true })}
          />
          {field("totalBudgetCents")}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="startsAt">Starts</Label>
          <Input
            id="startsAt"
            type="date"
            aria-invalid={!!errors.startsAt}
            defaultValue={
              defaultValues?.startsAt ? toDateInput(defaultValues.startsAt) : ""
            }
            {...form.register("startsAt", { valueAsDate: true })}
          />
          {field("startsAt")}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="endsAt">Ends</Label>
          <Input
            id="endsAt"
            type="date"
            aria-invalid={!!errors.endsAt}
            defaultValue={
              defaultValues?.endsAt ? toDateInput(defaultValues.endsAt) : ""
            }
            {...form.register("endsAt", { valueAsDate: true })}
          />
          {field("endsAt")}
        </div>
      </div>

      {serverError && (
        <p role="alert" className="text-sm text-destructive">
          {serverError}
        </p>
      )}

      <Button type="submit" disabled={submitting}>
        {submitting ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}
