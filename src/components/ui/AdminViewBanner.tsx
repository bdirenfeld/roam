"use client";

import { useEffect, useState } from "react";
import { adminTripFromCookies } from "@/lib/adminView";

/**
 * While the admin view is open (lib/adminView), one strip across the top says
 * so and offers the way out. Read after mount: the cookie is the browser's.
 */
export default function AdminViewBanner() {
  const [on, setOn] = useState(false);
  useEffect(() => { setOn(!!adminTripFromCookies(document.cookie)); }, []);
  if (!on) return null;
  return (
    <div data-testid="admin-view-banner" className="relative z-[100] flex items-center justify-center gap-3 px-4 py-2 text-[13px] text-white" style={{ background: "#B0541F" }}>
      <span>Admin view · you can change this plan, and the changes are real. This is someone else&apos;s journey.</span>
      <a href="/admin/exit" className="underline underline-offset-2 font-medium">Exit</a>
    </div>
  );
}
