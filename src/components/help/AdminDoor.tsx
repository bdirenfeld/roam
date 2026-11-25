"use client";

// Brennan's own way into the feedback inbox (24 Nov 2026): the avatar menu on a
// computer, Profile on a phone. It was only reachable by typing the address.
// Nobody else sees it, and /admin/feedback is a 404 for them anyway.
import { useEffect, useState, type CSSProperties } from "react";
import { createClient } from "@/lib/supabase/client";
import { isAdmin } from "@/lib/adminView";

export default function AdminDoor({ className, style }: { className?: string; style?: CSSProperties }) {
  const [waiting, setWaiting] = useState<number | null>(null);
  useEffect(() => {
    let off = false;
    createClient().auth.getSession().then(({ data }) => {
      if (off || !isAdmin(data.session?.user?.id)) return;
      setWaiting(0);
      fetch("/api/help?waiting=1").then((r) => (r.ok ? r.json() : null)).then((j: { waiting?: number } | null) => {
        if (!off && typeof j?.waiting === "number") setWaiting(j.waiting);
      }).catch(() => { /* the link still works */ });
    }).catch(() => { /* signed out */ });
    return () => { off = true; };
  }, []);
  if (waiting === null) return null;
  return <a href="/admin/feedback" data-testid="admin-door" className={className} style={style}>Feedback inbox{waiting ? ` · ${waiting} waiting` : ""}</a>;
}
