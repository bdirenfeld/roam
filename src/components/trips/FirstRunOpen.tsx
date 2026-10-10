"use client";

import { useEffect } from "react";
import { useNewJourney } from "@/components/overlays/AppOverlays";

// First sign-in (10 Oct 2026, growth audit): an account with no journeys used
// to land on "No journeys yet" and a small button, and the one stranger who
// signed up after the Instagram launch stopped exactly there. Now the Plan a
// journey form opens itself, once per browser session, so the first thing a
// new person does is type where they are going. Closing it shows the empty
// state underneath; it does not reopen until a new session.
const KEY = "roam:first-run-form-opened";

export function shouldOpenFirstRun(store: Pick<Storage, "getItem" | "setItem"> | null | undefined): boolean {
  if (!store) return true;
  try {
    if (store.getItem(KEY)) return false;
    store.setItem(KEY, "1");
    return true;
  } catch {
    return true;
  }
}

export default function FirstRunOpen() {
  const { open } = useNewJourney();
  useEffect(() => {
    let store: Storage | null = null;
    try {
      store = window.sessionStorage;
    } catch {
      store = null;
    }
    if (shouldOpenFirstRun(store)) open();
    // Once, on arrival. `open` is stable for the provider's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
