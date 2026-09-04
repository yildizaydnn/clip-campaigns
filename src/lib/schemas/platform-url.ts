import { z } from "zod";

import { PLATFORMS } from "./campaign";

/**
 * "The URL has to look like a real post URL on one of the campaign's
 * platforms." Shape checks only — we don't fetch the URL. Shared by the
 * submission form (instant field errors) and the create procedure (the
 * server never trusts the client).
 */
export const PLATFORM_URL_PATTERNS: Record<
  (typeof PLATFORMS)[number],
  RegExp
> = {
  tiktok: /^https:\/\/(www\.)?tiktok\.com\/@[A-Za-z0-9._-]+\/video\/\d{8,}\/?(\?.*)?$/,
  instagram: /^https:\/\/(www\.)?instagram\.com\/(reel|p)\/[A-Za-z0-9_-]{5,}\/?(\?.*)?$/,
  youtube: /^https:\/\/(www\.)?youtube\.com\/shorts\/[A-Za-z0-9_-]{6,}\/?(\?.*)?$/,
};

export const PLATFORM_URL_EXAMPLES: Record<(typeof PLATFORMS)[number], string> = {
  tiktok: "https://www.tiktok.com/@user/video/7300000000000000001",
  instagram: "https://www.instagram.com/reel/Cx1AbCdEfGh/",
  youtube: "https://www.youtube.com/shorts/dQw4w9WgXcQ",
};

export const createSubmissionSchema = z
  .object({
    campaignId: z.string().uuid(),
    platform: z.enum(PLATFORMS),
    postUrl: z.string().trim().max(500, "URL is too long"),
  })
  .superRefine((v, ctx) => {
    if (!PLATFORM_URL_PATTERNS[v.platform].test(v.postUrl)) {
      ctx.addIssue({
        code: "custom",
        path: ["postUrl"],
        message: `Doesn't look like a ${v.platform} post URL (e.g. ${PLATFORM_URL_EXAMPLES[v.platform]})`,
      });
    }
  });

export type CreateSubmissionInput = z.infer<typeof createSubmissionSchema>;
