import { redirect } from "next/navigation";

import { serverTrpc } from "@/lib/trpc/server";

export default async function Home() {
  const trpc = await serverTrpc();
  const me = await trpc.session.me();
  if (me?.role === "admin") redirect("/admin/campaigns");
  if (me?.role === "creator") redirect("/creator/campaigns");
  return (
    <main className="flex flex-1 items-center justify-center p-8">
      <div className="max-w-md rounded-lg border p-8 text-center">
        <span className="mx-auto flex size-10 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
          CC
        </span>
        <h1 className="mt-4 text-xl font-semibold">Welcome to Clip Campaigns</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Pick a user from the switcher to get started — admins review
          campaigns and budgets, creators submit clips and track earnings.
        </p>
      </div>
    </main>
  );
}
