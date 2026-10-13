"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { clarityProjectFor, loadClarity, shouldRecord } from "@/lib/sessionRecording";
import { flushFunnel } from "@/lib/funnel";

// Loads Microsoft Clarity for testers (see lib/sessionRecording). Renders
// nothing. The signed-in user's id (never their email) is passed to Clarity's
// identify, which hashes it, so a recording can be matched to a Roam account.
export default function SessionRecorder() {
  useEffect(() => {
    const projectId = clarityProjectFor(window.location.hostname, process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID);
    if (!projectId) return;
    let cancelled = false;
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        const user = data.session?.user;
        if (cancelled || !shouldRecord(projectId, user?.email)) return;
        const clarity = loadClarity(projectId);
        if (user) clarity("identify", user.id);
        // The landing page's view and source tag were sent before this point.
        flushFunnel();
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
