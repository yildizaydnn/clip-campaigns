import { z } from "zod";

export const PLATFORMS = ["tiktok", "instagram", "youtube"] as const;
export const CAMPAIGN_STATUSES = [
  "draft",
  "active",
  "paused",
  "completed",
] as const;

/**
 * Shared by the campaign form (client) and the create/update procedures
 * (server) — one schema, one set of messages. Money is integer cents;
 * dates arrive as real Date objects on both sides (superjson on the wire,
 * valueAsDate in the form).
 */
export const campaignFormSchema = z
  .object({
    title: z.string().trim().min(3, "Title needs at least 3 characters").max(120),
    platforms: z
      .array(z.enum(PLATFORMS))
      .min(1, "Pick at least one platform"),
    payoutPer1kViewsCents: z
      .number({ message: "Enter a whole number of cents" })
      .int("Whole cents only")
      .positive("Must be positive"),
    totalBudgetCents: z
      .number({ message: "Enter a whole number of cents" })
      .int("Whole cents only")
      .positive("Must be positive"),
    status: z.enum(CAMPAIGN_STATUSES),
    startsAt: z.date({ message: "Pick a start date" }),
    endsAt: z.date({ message: "Pick an end date" }),
  })
  .refine((d) => d.endsAt > d.startsAt, {
    message: "End date must be after the start date",
    path: ["endsAt"],
  });

export const createCampaignSchema = campaignFormSchema;
export const updateCampaignSchema = z.object({
  id: z.string().uuid(),
  data: campaignFormSchema,
});

export const listCampaignsSchema = z.object({
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(50).default(10),
  search: z.string().trim().max(120).optional(),
  status: z.enum(CAMPAIGN_STATUSES).optional(),
});

export type CampaignFormValues = z.infer<typeof campaignFormSchema>;
