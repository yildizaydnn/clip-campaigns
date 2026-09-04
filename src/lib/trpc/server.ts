import { headers } from "next/headers";
import { cache } from "react";

import { createContext } from "@/server/context";
import { appRouter } from "@/server/routers/_app";
import { createCallerFactory } from "@/server/trpc";

const createCaller = createCallerFactory(appRouter);

/**
 * Direct server-side caller for React Server Components — no HTTP round trip.
 * Cached per request so multiple awaits share one context.
 */
export const serverTrpc = cache(async () => {
  const h = await headers();
  return createCaller(await createContext({ headers: h }));
});
