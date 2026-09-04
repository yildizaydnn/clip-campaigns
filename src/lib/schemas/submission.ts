import { z } from "zod";

export const approveSubmissionSchema = z.object({
  submissionId: z.string().uuid(),
});

export const rejectSubmissionSchema = z.object({
  submissionId: z.string().uuid(),
  // "Rejecting requires a reason" — enforced here for forms and procedures
  // alike, and again by a check constraint in the database.
  reason: z
    .string()
    .trim()
    .min(3, "Give the creator an actionable reason (at least 3 characters)")
    .max(500, "Keep the reason under 500 characters"),
});

export type ApproveSubmissionInput = z.infer<typeof approveSubmissionSchema>;
export type RejectSubmissionInput = z.infer<typeof rejectSubmissionSchema>;
