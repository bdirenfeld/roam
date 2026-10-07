"use client";

import { useEffect } from "react";
import ErrorScreen from "@/components/ui/ErrorScreen";

// Any screen that crashes shows Roam's calm page, not Next's bare one (7 Oct 2026).
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("[Roam] screen error:", error); }, [error]);
  return <ErrorScreen onRetry={reset} />;
}
