"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { usePathname, useRouter } from "next/navigation";

import { canViewPath, ROLE_HOME } from "@/lib/auth/routes";
import { useTRPC } from "@/lib/trpc/client";

/**
 * This demo's stand-in for authentication: pick who you are. On switch, if
 * the new user can't view the current page, they land on their home instead
 * of a permission wall.
 */
export function UserSwitcher() {
  const trpc = useTRPC();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();

  const me = useQuery(trpc.session.me.queryOptions());
  const list = useQuery(trpc.session.listUsers.queryOptions());
  const switchUser = useMutation(
    trpc.session.switchUser.mutationOptions({
      onSuccess: ({ role }) => {
        // clear() is synchronous: it drops the previous user's cached data so
        // nothing of theirs can render, without waiting on refetches for a
        // page we are about to leave. Awaiting invalidateQueries here added a
        // round trip to every switch for data that was thrown away.
        queryClient.clear();
        if (!canViewPath(role, pathname)) router.push(ROLE_HOME[role]);
        else router.refresh();
      },
    }),
  );

  return (
    <label className="flex w-full flex-col gap-1 text-sm md:max-w-full">
      <span className="text-xs text-muted-foreground">Acting as</span>
      <select
        className="h-8 w-full min-w-0 rounded-md border bg-background px-2"
        value={me.data?.id ?? ""}
        disabled={list.isPending || switchUser.isPending}
        onChange={(e) => {
          if (e.target.value) switchUser.mutate({ userId: e.target.value });
        }}
      >
        <option value="" disabled>
          {list.isPending ? "Loading…" : "Select a user"}
        </option>
        {list.data?.map((u) => (
          <option key={u.id} value={u.id}>
            {u.email} ({u.role})
          </option>
        ))}
      </select>
    </label>
  );
}
