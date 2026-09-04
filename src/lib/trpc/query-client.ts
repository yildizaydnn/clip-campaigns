import { QueryClient } from "@tanstack/react-query";

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // avoids instant refetch loops on hydration; screens that need
        // fresher data (review queue) override this locally
        staleTime: 30 * 1000,
      },
    },
  });
}
