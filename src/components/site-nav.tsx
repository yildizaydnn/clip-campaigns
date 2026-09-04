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

export function SiteNav() {
  const trpc = useTRPC();
  const pathname = usePathname();
  const me = useQuery(trpc.session.me.queryOptions());
  if (!me.data) return null;

  return (
    <nav aria-label="Main" className="flex items-center gap-4 text-sm">
      {LINKS[me.data.role].map((l) => (
        <Link
          key={l.href}
          href={l.href}
          aria-current={pathname.startsWith(l.href) ? "page" : undefined}
          className={
            pathname.startsWith(l.href)
              ? "font-medium"
              : "text-muted-foreground hover:text-foreground"
          }
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
