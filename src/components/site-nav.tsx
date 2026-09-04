"use client";

import { useQuery } from "@tanstack/react-query";
import { LayoutGrid, ListVideo } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { useTRPC } from "@/lib/trpc/client";

const LINKS = {
  admin: [{ href: "/admin/campaigns", label: "Campaigns", icon: LayoutGrid }],
  creator: [
    { href: "/creator/campaigns", label: "Campaigns", icon: LayoutGrid },
    { href: "/creator/submissions", label: "My submissions", icon: ListVideo },
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
        vertical ? "flex flex-col gap-1 text-sm" : "flex items-center gap-4 text-sm"
      }
    >
      {LINKS[me.data.role].map((l) => {
        const active = pathname.startsWith(l.href);
        const Icon = l.icon;
        return (
          <Link
            key={l.href}
            href={l.href}
            aria-current={active ? "page" : undefined}
            className={
              vertical
                ? `flex items-center gap-2.5 rounded-md px-3 py-2 ${active ? "bg-accent font-medium text-accent-foreground" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"}`
                : active
                  ? "font-medium"
                  : "text-muted-foreground hover:text-foreground"
            }
          >
            {vertical && <Icon className="size-4" aria-hidden />}
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
