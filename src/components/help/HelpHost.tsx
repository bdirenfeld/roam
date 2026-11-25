"use client";

// Mounted once in the app layout. Opens Help for the doors outside a journey
// (avatar menu, Profile, the crash page's link) and keeps the unread dot.

import { useEffect, useState } from "react";
import HelpSheet from "./HelpSheet";
import { HELP_EVENT, HELP_SHEET_EVENT, setHelpUnread } from "@/lib/help/unread";
import { initMessenger, messengerStatus, openMessenger } from "@/lib/help/messenger";

const EVERY = 5 * 60 * 1000;

export default function HelpHost() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    let last = 0;
    const check = () => {
      // Once the messenger runs, it keeps the dot itself.
      if (messengerStatus() !== "off" || document.visibilityState === "hidden" || Date.now() - last < EVERY) return;
      last = Date.now();
      fetch("/api/help?unread=1").then((r) => (r.ok ? r.json() : null)).then((j: { unread?: number } | null) => {
        if (typeof j?.unread === "number") setHelpUnread(j.unread);
      }).catch(() => { /* the dot waits */ });
    };
    // The door waits to learn which system this person has: the messenger
    // (their past conversations first), or Roam's own chat. Never a guess.
    const show = () => { void openMessenger("messages").then((ok) => { if (!ok) setOpen(true); }); };
    // Roam's own dot is only for Roam's own chat; the messenger keeps the dot itself.
    void initMessenger().then((ok) => { if (!ok) check(); });
    // Back from Walkthroughs: the sheet itself, so the messages and videos are one tap away again.
    const sheet = () => setOpen(true);
    window.addEventListener(HELP_SHEET_EVENT, sheet);
    window.addEventListener(HELP_EVENT, show);
    document.addEventListener("visibilitychange", check);
    const url = new URL(window.location.href);
    if (url.searchParams.get("help")) {
      show();
      url.searchParams.delete("help");
      window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
    }
    return () => {
      window.removeEventListener(HELP_SHEET_EVENT, sheet);
      window.removeEventListener(HELP_EVENT, show);
      document.removeEventListener("visibilitychange", check);
    };
  }, []);
  return open ? <HelpSheet onClose={() => setOpen(false)} /> : null;
}
