"use client";

import DesktopMasthead from "@/components/ui/DesktopMasthead";
import { GlobalSearchProvider } from "@/components/search/GlobalSearch";
import { AppOverlaysProvider } from "@/components/overlays/AppOverlays";
import { ToastProvider } from "@/components/ui/Toast";
import OfflineQueueIndicator from "@/components/offline/OfflineQueueIndicator";
import InstallBanner from "@/components/ui/InstallBanner";
import ErrorReporter from "@/components/ui/ErrorReporter";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {

  return (
    // Search is mounted once, here, so every entry point in the app (the ⌕ in
    // the masthead and the app header, the two ··· menus, "/" and ⌘/Ctrl-K)
    // drives the same overlay rather than each screen keeping its own.
    <GlobalSearchProvider>
      {/* Plan a journey, Trip settings and Profile are mounted once here too,
          so every trigger in the app opens the screen in place instead of
          navigating away. The routes still exist for links and bookmarks. */}
      <AppOverlaysProvider>
       {/* One toast for the whole app — every host's "deleted · Undo" and
           "Couldn't save" goes through it (see ui/Toast.tsx). */}
       <ToastProvider>
        <DesktopMasthead />
        <div className="mobile-container flex flex-col bg-white md:bg-transparent md:!min-h-[calc(100dvh-64px)]">
          {/* No bottom bar since 24 Sep 2026: the day map carries a map disc and
              the Map's back arrow returns. So no bottom allowance either. */}
          <main className="flex-1">{children}</main>
        </div>
        {/* Mounted once, here: the queue is global, so the "will sync" pill is
            too. It also owns the replay wiring (online / focus). */}
        <OfflineQueueIndicator />
        {/* "Put Roam on your phone": one tap on Android, the two steps on
            iPhone. App-wide, so a guest who arrives by link sees it too. */}
        <InstallBanner />
        {/* Records what the app could not handle, so a failure on someone
            else's phone is not silent (scale audit, Sept 2026). */}
        <ErrorReporter />
       </ToastProvider>
      </AppOverlaysProvider>
    </GlobalSearchProvider>
  );
}
