"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import BottomNav from "@/components/ui/BottomNav";
import DesktopMasthead from "@/components/ui/DesktopMasthead";
import { GlobalSearchProvider } from "@/components/search/GlobalSearch";
import { AppOverlaysProvider } from "@/components/overlays/AppOverlays";
import OfflineQueueIndicator from "@/components/offline/OfflineQueueIndicator";

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
      {/* Plan a journey, Trip settings and Profile are mounted once here too,
          so every trigger in the app opens the screen in place instead of
          navigating away. The routes still exist for links and bookmarks. */}
      <AppOverlaysProvider>
        <DesktopMasthead />
        <div className="mobile-container flex flex-col bg-white md:bg-transparent md:!min-h-[calc(100dvh-64px)]">
          <main className={isDayView ? "flex-1" : "flex-1 pb-20 md:pb-0"}>{children}</main>
        </div>
        <Suspense>
          <BottomNav />
        </Suspense>
        {/* Mounted once, here: the queue is global, so the "will sync" pill is
            too. It also owns the replay wiring (online / focus). */}
        <OfflineQueueIndicator />
      </AppOverlaysProvider>
    </GlobalSearchProvider>
  );
}
