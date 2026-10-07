"use client";

// "Isha joined Tuscany" — the owner's toast when someone joins their journey
// (7 Oct 2026, delight audit). One hook for the phone Day view and the Plan
// route (PlanSwitch: the week and the phone board). Owner only: the caller
// passes `enabled` false for a guest, and the route answers 403 to anyone but
// the owner. The shared /journey page never mounts it. Rules: lib/members/joined.

import { useEffect } from "react";
import { useToast } from "@/components/ui/Toast";
import { joinedToastFor, type JoinedMember } from "@/lib/members/joined";

function localStore(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function useMemberJoinedToast(tripId: string, tripTitle: string, enabled: boolean) {
  const { toast } = useToast();
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/trips/${tripId}/members`);
        if (!res.ok) return;
        const { members } = (await res.json()) as { members?: JoinedMember[] };
        if (cancelled || !members?.length) return;
        const message = joinedToastFor(localStore(), tripId, tripTitle, members, Date.now());
        // wait: on a journey's eve the eve toast arrives too; neither replaces the other (7 Oct 2026, re-audit).
        if (message) toast({ message, duration: 5000, wait: true });
      } catch {
        // Offline or a failed read: say nothing; it will be news next time.
      }
    })();
    return () => { cancelled = true; };
  }, [tripId, tripTitle, enabled, toast]);
}
