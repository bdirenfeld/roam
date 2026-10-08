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
import PastJourneysList from "@/components/trip/PastJourneysList";
import CopyJourneySheet from "@/components/trip/CopyJourneySheet";
import FullMapClient from "@/components/map/FullMapClient";
import { openedKey } from "@/lib/booking/didYouBook";
import { welcomeHomeKey } from "@/lib/trips/welcomeHome";
import { installStub, type StubConfig } from "./stub";
import type { ClientScreen } from "./screens";
import {
  OWNER, TRIP_ID, nextDoorDay, nextDoorJourney, SHEET_DAYS, COPY_TODAY, copyTables, mapCards, pastTrip, ADD_LEG_API, ADD_LEG_DAY, addLegTables, bookingTables, days, isoFromToday, journeyCards, sheetCards, timeCard, trip, tuscanyDay,
} from "./fixtures";


const noop = () => {};
/** Hosts the Map screens may reach (scripts/phone-check.mjs lets the same ones resolve). */
const MAPBOX_HOSTS = [/^api\.mapbox\.com$/, /\.tiles\.mapbox\.com$/, /^events\.mapbox\.com$/];

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

/** Clicks the first VISIBLE element matching `selector` once it appears (an aria-labelled ⋯ has no text). */
/** Taps the days row's nth day once the map has opened (the day page's map screens). */
function useTapDayWhenMapOpen(n: number | null) {
  useEffect(() => {
    if (n == null) return;
    let tries = 0;
    const t = window.setInterval(() => {
      const open = document.querySelector("[data-testid='day-trip-map'] .mapboxgl-marker");
      const day = document.querySelectorAll<HTMLElement>("[data-testid='strip-day-target']")[n]?.parentElement;
      if (open && day) { window.clearInterval(t); window.setTimeout(() => day.click(), 1500); }
      else if (++tries > 200) window.clearInterval(t);
    }, 50);
    return () => window.clearInterval(t);
  }, [n]);
}

function useClickSelector(selector: string | null) {
  useEffect(() => {
    if (!selector) return;
    let tries = 0;
    const t = window.setInterval(() => {
      const el = Array.from(document.querySelectorAll<HTMLElement>(selector)).find((e) => e.offsetParent !== null);
      if (el) { window.clearInterval(t); el.click(); }
      else if (++tries > 100) window.clearInterval(t);
    }, 50);
    return () => window.clearInterval(t);
  }, [selector]);
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
  if (screen === "past-menu" || screen.startsWith("copy-sheet")) return { userId: OWNER, tables: copyTables() };
  // The full Map draws real Mapbox tiles: the one screen whose network is not off (Mapbox only).
  if (screen === "map" || screen === "map-one") return { userId: OWNER, tables: {}, passHosts: MAPBOX_HOSTS };
  // The day strip with real tiles: two stops next door, side by side.
  if (screen === "day-nextdoor" || screen.startsWith("day-map")) {
    const ds = days(isoFromToday(0), 5);
    return { userId: OWNER, tables: { cards: screen.startsWith("day-map") ? nextDoorJourney(ds) : nextDoorDay(ds[0]).cards, trips: [trip(ds[0].date, ds[4].date)], days: ds }, passHosts: MAPBOX_HOSTS };
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
  // The day's map, opened in place: tap the strip's map disc.
  useClickSelector(screen.startsWith("day-map") ? '[aria-label="Open the map"]' : null);
  // Then the same day again (the whole trip), or the next day (the map goes there).
  useTapDayWhenMapOpen(screen === "day-map-trip" ? 0 : screen === "day-map-next" ? 1 : null);
  useClickSelector(screen === "past-menu" ? '[aria-label="Options for New York (Mia & Daddy)"]' : screen === "copy-sheet-dates" ? '[data-testid="copy-start"]' : null);
  useTypeAndPick(screen === "add-leg" || screen === "add-leg-from" ? { placeholder: "Search", text: "mfuwe bus", pick: "Mfuwe Bus Station" } : null);

  if (screen === "day" || screen === "day-welcome") {
    const start = screen === "day" ? isoFromToday(0) : isoFromToday(-6);
    const ds = days(start, 5);
    const t = trip(start, ds[4].date);
    const shown = screen === "day" ? tuscanyDay(ds[0]) : { ...ds[4], cards: [] };
    return <DayViewClient trip={t} days={ds} dayWithCards={shown} hotelCards={[]} initialNotes={null} phone />;
  }
  if (screen === "day-nextdoor" || screen.startsWith("day-map")) {
    const ds = days(isoFromToday(0), 5);
    return <DayViewClient trip={trip(ds[0].date, ds[4].date)} days={ds} dayWithCards={nextDoorDay(ds[0])} hotelCards={[]} initialNotes={null} phone />;
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
  if (screen === "past-menu") {
    return <div className="px-4 pt-3"><PastJourneysList trips={[pastTrip(), pastTrip()].map((t, i) => (i ? { ...t, id: "trip-preview-cr", title: "Costa Rica", start_date: "2026-03-04", end_date: "2026-03-14" } : t))} hrefByTrip={{}} userId={OWNER} /></div>;
  }
  if (screen === "map" || screen === "map-one") {
    const start = isoFromToday(0);
    const ds = days(start, 5);
    return <FullMapClient trip={trip(start, ds[4].date)} days={ds} cards={mapCards(ds, screen === "map-one")} />;
  }
  if (screen.startsWith("copy-sheet")) {
    return <CopyJourneySheet trip={pastTrip()} onClose={noop} today={COPY_TODAY} />;
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
