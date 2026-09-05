"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createSubmissionSchema,
  PLATFORM_URL_EXAMPLES,
  type CreateSubmissionInput,
} from "@/lib/schemas/platform-url";
import { appErrorCode } from "@/lib/errors";
import { useTRPC } from "@/lib/trpc/client";

export function SubmissionForm({
  campaignId,
  allowedPlatforms,
}: {
  campaignId: string;
  allowedPlatforms: ("tiktok" | "instagram" | "youtube")[];
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const form = useForm<CreateSubmissionInput>({
    resolver: zodResolver(createSubmissionSchema),
    defaultValues: { campaignId, platform: allowedPlatforms[0], postUrl: "" },
  });
  const { errors } = form.formState;

  const create = useMutation(
    trpc.submission.create.mutationOptions({
      onSuccess: async () => {
        form.reset({ campaignId, platform: allowedPlatforms[0], postUrl: "" });
        await queryClient.invalidateQueries({
          queryKey: trpc.submission.mine.queryKey(),
        });
      },
      onError: (e) => {
        if (appErrorCode(e) === "DUPLICATE_URL") {
          form.setError("postUrl", { message: e.message });
        }
      },
    }),
  );

  const platform = form.watch("platform");
  const appCode = appErrorCode(create.error);

  return (
    <form
      onSubmit={form.handleSubmit((v) => create.mutate(v))}
      className="max-w-lg space-y-4"
      noValidate
    >
      <div className="space-y-1.5">
        <Label htmlFor="platform">Platform</Label>
        <select
          id="platform"
          className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          {...form.register("platform")}
        >
          {allowedPlatforms.map((p) => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="postUrl">Post URL</Label>
        <Input
          id="postUrl"
          type="url"
          placeholder={PLATFORM_URL_EXAMPLES[platform]}
          aria-invalid={!!errors.postUrl}
          aria-describedby={errors.postUrl ? "postUrl-error" : undefined}
          {...form.register("postUrl")}
        />
        {errors.postUrl && (
          <p id="postUrl-error" role="alert" className="text-sm text-destructive">
            {errors.postUrl.message}
          </p>
        )}
      </div>

      {create.isError && appCode !== "DUPLICATE_URL" && (
        <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {create.error.message}
        </p>
      )}
      {create.isSuccess && (
        <p role="status" className="rounded-md border bg-muted px-3 py-2 text-sm">
          Submitted — you can track it under “My submissions”.
        </p>
      )}

      <Button type="submit" disabled={create.isPending}>
        {create.isPending ? "Submitting…" : "Submit clip"}
      </Button>
    </form>
  );
}
