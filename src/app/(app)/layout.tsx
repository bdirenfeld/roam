"use client";

import { Suspense } from "react";
import { usePathname } from "next/navigation";
import BottomNav from "@/components/ui/BottomNav";

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isFullWidthPage = pathname?.endsWith("/plan") || pathname?.endsWith("/map");
  // Day view manages its own height (h-dvh) and its own bottom padding — no pb-20 here
  const isDayView = !!pathname?.match(/\/days\//);

  return isFullWidthPage ? (
    <>
      <main className="flex-1 pb-20">{children}</main>
      <Suspense>
        <BottomNav />
      </Suspense>
    </>
  ) : (
    <div className="mobile-container flex flex-col bg-white">
      <main className={isDayView ? "flex-1" : "flex-1 pb-20"}>{children}</main>
      <Suspense>
        <BottomNav />
      </Suspense>
    </div>
  );
}
