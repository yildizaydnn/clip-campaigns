import { publicProcedure, router } from "../trpc";
import { sessionRouter } from "./session";

export const appRouter = router({
  health: publicProcedure.query(() => ({ ok: true as const })),
  session: sessionRouter,
});

export type AppRouter = typeof appRouter;
