"use client";

// Mounted once in the app layout. Opens Help for the doors outside a journey
// (avatar menu, Profile, the crash page's link) and keeps the unread dot.

import { useEffect, useState } from "react";
import HelpSheet from "./HelpSheet";
import { HELP_EVENT, setHelpUnread } from "@/lib/help/unread";
import { messengerReady, openMessenger, startMessenger } from "@/lib/help/messenger";

const EVERY = 5 * 60 * 1000;

export default function HelpHost() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let last = 0;
    const check = () => {
      // Once the messenger runs, it keeps the dot itself.
      if (messengerReady() || document.visibilityState === "hidden" || Date.now() - last < EVERY) return;
      last = Date.now();
      fetch("/api/help?unread=1").then((r) => (r.ok ? r.json() : null)).then((j: { unread?: number } | null) => {
        if (typeof j?.unread === "number") setHelpUnread(j.unread);
      }).catch(() => { /* the dot waits */ });
    };
    // "Message us" goes straight to the messenger when it is running; Roam's own chat otherwise.
    const show = () => { if (!openMessenger()) setOpen(true); };
    check();
    fetch("/api/help/identity").then((r) => (r.ok && !r.redirected ? r.json() : null)).then((j: { jwt?: string | null } | null) => {
      if (j?.jwt) void startMessenger(j.jwt);
    }).catch(() => { /* Roam's own chat stays */ });
    window.addEventListener(HELP_EVENT, show);
    document.addEventListener("visibilitychange", check);
    const url = new URL(window.location.href);
    if (url.searchParams.get("help")) {
      show();
      url.searchParams.delete("help");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
    return () => {
      window.removeEventListener(HELP_EVENT, show);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  return open ? <HelpSheet onClose={() => setOpen(false)} /> : null;
}
