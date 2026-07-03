/**
 * queryClient.ts — TanStack QueryClient singleton.
 *
 * Created once at module scope and shared across the whole app via
 * QueryClientProvider in main.tsx. Never instantiate QueryClient elsewhere.
 *
 * Default config:
 *  - staleTime 30 s  — dashboard data is fine to be slightly stale
 *  - retry 1         — one retry on network errors, not three (the default)
 *  - refetchOnWindowFocus false — avoids hammering the API when the user
 *    switches tabs and comes back; manual refresh is fine for a dashboard
 */

import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime:            30 * 1000, // 30 seconds
      retry:                1,
      refetchOnWindowFocus: false,
    },
  },
});
