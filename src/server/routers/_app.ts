import { publicProcedure, router } from "../trpc";
import { campaignRouter } from "./campaign";
import { sessionRouter } from "./session";
import { submissionRouter } from "./submission";

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true as const })),
  campaign: campaignRouter,
  session: sessionRouter,
  submission: submissionRouter,
});

export type AppRouter = typeof appRouter;
