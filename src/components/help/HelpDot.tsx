"use client";
import { useHelpUnread } from "@/lib/help/unread";

/** A reply is waiting. Sits on its (relative) parent's top right corner. */
export default function HelpDot({ className = "top-1 right-1" }: { className?: string }) {
  const n = useHelpUnread();
  if (!n) return null;
  return <span role="status" aria-label="New reply" data-testid="help-dot" className={`absolute ${className} w-[9px] h-[9px] rounded-full pointer-events-none`} style={{ background: "#B0541F", boxShadow: "0 0 0 2px #fff" }} />;
}
