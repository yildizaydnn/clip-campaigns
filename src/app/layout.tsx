import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { SiteNav } from "@/components/site-nav";
import { UserSwitcher } from "@/components/user-switcher";
import { TRPCReactProvider } from "@/lib/trpc/client";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Clip Campaigns",
  description: "Clipping campaign marketplace — take-home",
};

function Brand() {
  return (
    <div className="flex items-center gap-2.5">
      <span
        aria-hidden
        className="flex size-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground"
      >
        CC
      </span>
      <span className="font-semibold tracking-tight">Clip Campaigns</span>
    </div>
  );
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <TRPCReactProvider>
          <div className="flex min-h-svh">
            {/* dashboard shell: fixed sidebar on md+, top bar on mobile */}
            <aside className="sticky top-0 hidden h-svh w-60 shrink-0 flex-col border-r bg-sidebar md:flex">
              <div className="border-b px-4 py-4">
                <Brand />
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                <p className="px-3 pb-2 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Menu
                </p>
                <SiteNav vertical />
              </div>
              <div className="border-t bg-muted/40 p-3">
                <UserSwitcher />
              </div>
            </aside>

            <div className="flex min-w-0 flex-1 flex-col">
              <header className="flex items-center justify-between gap-3 border-b px-4 py-2 md:hidden">
                <Brand />
                <div className="flex items-center gap-4">
                  <SiteNav />
                  <UserSwitcher />
                </div>
              </header>
              {children}
            </div>
          </div>
        </TRPCReactProvider>
      </body>
    </html>
  );
}
