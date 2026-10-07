"use client";

import { useEffect } from "react";
import ErrorScreen from "@/components/ui/ErrorScreen";

// When the root layout itself fails, the same calm page, with its own <html>.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error("[Roam] app error:", error); }, [error]);
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
        <ErrorScreen onRetry={reset} />
      </body>
    </html>
  );
}
