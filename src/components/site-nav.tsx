"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useTRPC } from "@/lib/trpc/client";

const LINKS = {
  admin: [{ href: "/admin/campaigns", label: "Campaigns" }],
  creator: [
    { href: "/creator/campaigns", label: "Campaigns" },
    { href: "/creator/submissions", label: "My submissions" },
  ],
} as const;

export function SiteNav({ vertical = false }: { vertical?: boolean }) {
  const trpc = useTRPC();
  const pathname = usePathname();
  const me = useQuery(trpc.session.me.queryOptions());
  if (!me.data) return null;

  return (
    <nav
      aria-label="Main"
      className={
        vertical
          ? "flex flex-col gap-1 text-sm"
          : "flex items-center gap-4 text-sm"
      }
    >
      {LINKS[me.data.role].map((l) => {
        const active = pathname.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={
              vertical
                ? `rounded-md px-3 py-2 ${active ? "bg-muted font-medium" : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"}`
                : active
                  ? "font-medium"
                  : "text-muted-foreground hover:text-foreground"
            }
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
