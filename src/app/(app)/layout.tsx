"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import BottomNav from "@/components/ui/BottomNav";
import DesktopMasthead from "@/components/ui/DesktopMasthead";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isFullWidthPage = pathname?.endsWith("/plan") || pathname?.endsWith("/map");
  // Day view manages its own height (h-dvh) and its own bottom padding — no pb-20 here
  const isDayView = !!pathname?.match(/\/days\//);

  return (
    <>
      <DesktopMasthead />
      {isFullWidthPage ? (
        <main className="flex-1 pb-20 md:pb-0">{children}</main>
      ) : (
        <div className="mobile-container flex flex-col bg-white md:bg-transparent">
          <main className={isDayView ? "flex-1" : "flex-1 pb-20 md:pb-0"}>{children}</main>
        </div>
      )}
      <Suspense>
        <BottomNav />
      </Suspense>
    </>
  );
}
