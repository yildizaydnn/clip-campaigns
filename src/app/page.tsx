import { redirect } from "next/navigation";

import { serverTrpc } from "@/lib/trpc/server";

export default async function Home() {
  const trpc = await serverTrpc();
  const me = await trpc.session.me();
  if (me?.role === "admin") redirect("/admin/campaigns");
  if (me?.role === "creator") redirect("/creator/campaigns");
  return (
    <main className="mx-auto max-w-lg p-8 text-center">
      <h1 className="text-xl font-semibold">Welcome</h1>
      <p className="mt-2 text-muted-foreground">
        Pick a user from the switcher in the header to get started. Admins
        review campaigns; creators submit clips.
      </p>
    </main>
  );
}
