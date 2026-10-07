"use client";

// ── The phone preview's client side (dev only, see ./devOnly.ts) ─────────
// Installs the fixture data layer (./stub.ts) BEFORE anything renders, then
// mounts the real component for the screen under the same providers the app
// layout gives it. Nothing is rendered on the server: fixture dates come from
// the phone's local today, as the components' own do.

import { useEffect, useState, type ReactNode } from "react";
import { GlobalSearchProvider } from "@/components/search/GlobalSearch";
import { AppOverlaysProvider } from "@/components/overlays/AppOverlays";
import { ToastProvider, useToast } from "@/components/ui/Toast";
import DayViewClient from "@/components/day/DayViewClient";
import CardBottomSheet from "@/components/cards/CardBottomSheet";
import TimeSheet from "@/components/day/TimeSheet";
import DocumentsSheet from "@/components/plan/DocumentsSheet";
import CreateCardSheet from "@/components/plan/CreateCardSheet";
import { openedKey } from "@/lib/booking/didYouBook";
import { welcomeHomeKey } from "@/lib/trips/welcomeHome";
import { installStub, type StubConfig } from "./stub";
import type { ClientScreen } from "./screens";
import {
  OWNER, TRIP_ID, SHEET_DAYS, ADD_LEG_API, ADD_LEG_DAY, addLegTables, bookingTables, days, isoFromToday, journeyCards, sheetCards, timeCard, trip, tuscanyDay,
} from "./fixtures";


const noop = () => {};

/** Clicks the first button inside `scope` whose text is `text`, once it appears (a state behind a tap). */
function useClickWhenReady(target: { scope: string; text: string } | null) {
  const scope = target?.scope, text = target?.text;
  useEffect(() => {
    if (!scope || !text) return;
    let tries = 0;
    const t = window.setInterval(() => {
      const el = Array.from(document.querySelectorAll<HTMLElement>(`${scope} button`)).find((b) => b.textContent?.trim() === text);
      if (el) { window.clearInterval(t); el.click(); }
      else if (++tries > 100) window.clearInterval(t);
    }, 50);
    return () => window.clearInterval(t);
  }, [scope, text]);
}

/**
 * Types `text` into the input with `placeholder` (prefix), then clicks the
 * first button that starts with `pick`: a search and its answer, the way a
 * finger does it. React only hears a value set through the native setter.
 */
function useTypeAndPick(target: { placeholder: string; text: string; pick: string } | null) {
  const placeholder = target?.placeholder, text = target?.text, pick = target?.pick;
  useEffect(() => {
    if (!placeholder || !text || !pick) return;
    let tries = 0, typed = false;
    const t = window.setInterval(() => {
      if (!typed) {
        const input = Array.from(document.querySelectorAll<HTMLInputElement>("input")).find((i) => i.placeholder.startsWith(placeholder));
        if (input) {
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, text);
          input.dispatchEvent(new Event("input", { bubbles: true }));
          typed = true;
        }
      } else {
        const b = Array.from(document.querySelectorAll<HTMLElement>("button")).find((x) => x.textContent?.trim().startsWith(pick));
        if (b) { window.clearInterval(t); b.click(); return; }
      }
      if (++tries > 200) window.clearInterval(t);
    }, 50);
    return () => window.clearInterval(t);
  }, [placeholder, text, pick]);
}

function Toasts({ second }: { second: boolean }) {
  const { toast } = useToast();
  useEffect(() => {
    // Two notices nobody's tap caused, arriving together on the first open.
    toast({ message: "Sam joined Lisbon", wait: true, duration: second ? 400 : 60000 });
    toast({ message: "Lisbon tomorrow · 2 still to book", action: { label: "Bookings", onClick: noop }, wait: true, duration: 60000 });
  }, [toast, second]);
  return <p className="p-6 text-[13px] text-gray-500">{second ? "The second notice, after the first has gone." : "The first notice; the second waits."}</p>;
}

function stubFor(screen: ClientScreen): StubConfig {
  if (screen === "day" || screen === "day-welcome") {
    const start = screen === "day" ? isoFromToday(0) : isoFromToday(-6);
    const ds = days(start, 5);
    return { userId: OWNER, tables: { cards: journeyCards(ds), trips: [trip(start, ds[4].date)], days: ds } };
  }
  if (screen === "add-leg" || screen === "add-leg-from") {
    return { userId: OWNER, tables: addLegTables(screen === "add-leg-from"), api: ADD_LEG_API };
  }
  if (screen.startsWith("bookings")) {
    const checklist = screen === "bookings-booked" ? { flights: "booked", stays: "booked", car: "booked" } : null;
    return { userId: OWNER, tables: bookingTables(checklist), api: { "/api/booking/airports": { airports: ["FLR", "PSA"] } } };
  }
  return { userId: OWNER, tables: {} };
}

function Screen({ screen }: { screen: ClientScreen }) {
  // A state that sits behind a tap: the harness makes the tap.
  useClickWhenReady(
    screen === "time-cleared" ? { scope: "[data-preview-time]", text: "Clear time" }
      : screen === "bookings-asking" ? { scope: "[data-testid='to-book-car-ask']", text: "Booked" }
      : null,
  );
  // The hand-add screens: search "mfuwe bus" and pick the station.
  useTypeAndPick(screen === "add-leg" || screen === "add-leg-from" ? { placeholder: "Search", text: "mfuwe bus", pick: "Mfuwe Bus Station" } : null);

  if (screen === "day" || screen === "day-welcome") {
    const start = screen === "day" ? isoFromToday(0) : isoFromToday(-6);
    const ds = days(start, 5);
    const t = trip(start, ds[4].date);
    const shown = screen === "day" ? tuscanyDay(ds[0]) : { ...ds[4], cards: [] };
    return <DayViewClient trip={t} days={ds} dayWithCards={shown} hotelCards={[]} initialNotes={null} phone />;
  }
  if (screen.startsWith("card-")) {
    const c = { "card-cost": sheetCards.cost, "card-closed": sheetCards.closed, "card-late": sheetCards.late, "card-fit": sheetCards.fit, "card-leg": sheetCards.leg }[screen as "card-cost"];
    return <CardBottomSheet card={c} onClose={noop} onCardUpdate={noop} onCardDelete={noop} days={SHEET_DAYS} tripDestination="Tuscany, Italy" partySize={2} />;
  }
  if (screen === "time" || screen === "time-cleared") {
    return <div data-preview-time><TimeSheet card={timeCard} onClose={noop} onSave={noop} /></div>;
  }
  if (screen === "add-leg" || screen === "add-leg-from") {
    return <CreateCardSheet dayId={ADD_LEG_DAY} tripId={TRIP_ID} endPosition={0} onClose={noop} onCardCreated={noop} dayLabel="Tue 24 Aug" />;
  }
  if (screen.startsWith("bookings")) {
    return <DocumentsSheet tripId={TRIP_ID} onClose={noop} onImport={noop} />;
  }
  return <Toasts second={screen === "toasts-second"} />;
}

export default function PhoneHarness({ screen }: { screen: ClientScreen }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    // Only this preview's own keys: "shown once" and "did you book it?" memories.
    try {
      localStorage.removeItem(welcomeHomeKey(TRIP_ID));
      sessionStorage.removeItem(openedKey(TRIP_ID));
      if (screen === "bookings-asking") sessionStorage.setItem(openedKey(TRIP_ID), JSON.stringify(["flights", "car"]));
    } catch { /* storage blocked: the screen still renders */ }
    installStub(stubFor(screen));
    setReady(true);
  }, [screen]);
  if (!ready) return null;
  return <Providers screen={screen}><Screen screen={screen} /></Providers>;
}

function Providers({ screen, children }: { screen: ClientScreen; children: ReactNode }) {
  // The app layout's providers and its one container, minus the desktop masthead.
  return (
    <GlobalSearchProvider>
      <AppOverlaysProvider>
        <ToastProvider>
          <div className="mobile-container flex flex-col bg-white md:bg-transparent">
            {/* data-phone-screen: scripts/phone-check.mjs waits for it before measuring. */}
            <main className="flex-1" data-phone-screen={screen}>{children}</main>
          </div>
        </ToastProvider>
      </AppOverlaysProvider>
    </GlobalSearchProvider>
  );
}
