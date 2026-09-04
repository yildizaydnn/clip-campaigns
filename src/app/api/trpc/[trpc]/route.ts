// The only route handler in the repo: the tRPC transport.
// All application data — including the dev user switcher — goes through tRPC.
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import { createContext } from "@/server/context";
import { appRouter } from "@/server/routers/_app";

const handler = (req: Request) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: ({ resHeaders }) =>
      createContext({ headers: req.headers, resHeaders }),
  });

export { handler as GET, handler as POST };
