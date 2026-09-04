import { serverTrpc } from "@/lib/trpc/server";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const trpc = await serverTrpc();
  const me = await trpc.session.me();
  if (me?.role !== "admin") {
    return (
      <main className="mx-auto max-w-lg p-8 text-center">
        <h1 className="text-xl font-semibold">Admins only</h1>
        <p className="mt-2 text-muted-foreground">
          Switch to an admin user in the header to open this area.
        </p>
      </main>
    );
  }
  return <>{children}</>;
}
