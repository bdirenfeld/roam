"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import BottomNav from "@/components/ui/BottomNav";
import DesktopMasthead from "@/components/ui/DesktopMasthead";
import { GlobalSearchProvider } from "@/components/search/GlobalSearch";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // Day view manages its own height (h-dvh) and its own bottom padding — no pb-20 here
  const isDayView = !!pathname?.match(/\/days\//);

  return (
    // Search is mounted once, here, so every entry point in the app (the ⌕ in
    // the masthead and the app header, the two ··· menus, "/" and ⌘/Ctrl-K)
    // drives the same overlay rather than each screen keeping its own.
    <GlobalSearchProvider>
      <DesktopMasthead />
      <div className="mobile-container flex flex-col bg-white md:bg-transparent md:!min-h-[calc(100dvh-64px)]">
        <main className={isDayView ? "flex-1" : "flex-1 pb-20 md:pb-0"}>{children}</main>
      </div>
      <Suspense>
        <BottomNav />
      </Suspense>
    </GlobalSearchProvider>
  );
}
