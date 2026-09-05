"use client";

// ── App overlays ──────────────────────────────────────────────────────────
// Three full-page screens — Plan a journey, Trip settings, Profile — that no
// longer take the traveller off the page they were on. Brennan, Aug 2026:
// "the less times we move someone to a different page the better."
//
// Same shape as components/search/GlobalSearch.tsx: one provider mounted in
// (app)/layout, a context anyone can call, and a single overlay instance per
// screen. Nothing is prop-drilled and nothing is duplicated — the overlay and
// the route render the very same component.
//
// The routes are untouched and still work:
//   /trips/new?start=…&end=…&destName=…&destLat=…&destLng=…
//   /trips/{id}/settings#share
//   /profile
// Every trigger below is a real <Link> to its route with an onClick that
// preventDefaults, so a bookmark, a shared link and a ctrl/cmd-click all land
// on the full page while a plain click opens the overlay.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { CSSProperties, MouseEvent, ReactNode } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import Overlay from "@/components/ui/Overlay";
import { JourneyNotesSheet } from "@/components/trip/JourneyNotes";
import type { Person } from "@/components/trip/TravellersSection";
import { createClient } from "@/lib/supabase/client";
import { isTripGuest } from "@/lib/trip-access-client";
import { buildNewJourneyHref } from "@/lib/newJourneySeed";
import type { NewJourneySeed } from "@/lib/newJourneySeed";
import { loadEstimate } from "@/lib/budget/load";
import type { EstimateData } from "@/lib/budget/load";
import { loadShareState } from "@/lib/share-actions";
import type { ShareState } from "@/lib/share-actions";
import type { Day, Trip } from "@/types/database";
import type { Idea } from "@/components/trip/IdeasClient";
import type { JourneySummary } from "@/components/trip/PromoteToWishlistSheet";

export type { NewJourneySeed };

// The three screens are mounted app-wide but opened rarely, so they load as
// their own chunks rather than riding in every route's first-load JS. The
// shell paints instantly either way — only what goes inside it waits. `ssr:
// false` because none of them can render on the server anyway: each is a
// client screen that reads through the browser Supabase client.
const NewJourneyForm = dynamic(() => import("@/components/trip/NewJourneyForm"), {
  ssr: false,
});
const ProfileForm = dynamic(() => import("@/components/profile/ProfileForm"), {
  ssr: false,
});
const TripSettingsClient = dynamic(() => import("@/components/trip/TripSettingsClient"), {
  ssr: false,
});
const EstimateClient = dynamic(() => import("@/components/trip/EstimateClient"), {
  ssr: false,
});
const IdeasClient = dynamic(() => import("@/components/trip/IdeasClient"), {
  ssr: false,
});

// ── Contexts ──────────────────────────────────────────────────────────────
// No-op defaults rather than throws: a trigger rendered outside the provider
// should be inert, never a crash on a page that otherwise works. (Same call
// GlobalSearch makes.)

interface NewJourneyController {
  /** Open the form, optionally seeded with dates and/or a destination. */
  open: (seed?: NewJourneySeed | null) => void;
}
const NewJourneyCtx = createContext<NewJourneyController>({ open: () => {} });
export const useNewJourney = () => useContext(NewJourneyCtx);

/** What the opener already has in hand, so the overlay doesn't re-fetch it. */
export interface TripSettingsOpenOptions {
  /** Section to scroll to — the Plan menu's "Share itinerary" passes "share". */
  section?: "share" | "notes" | "entry";
  trip?: Trip;
  days?: Day[];
}
interface TripSettingsController {
  open: (tripId: string, opts?: TripSettingsOpenOptions) => void;
}
const TripSettingsCtx = createContext<TripSettingsController>({ open: () => {} });
export const useTripSettings = () => useContext(TripSettingsCtx);

interface EstimateController {
  open: (tripId: string) => void;
}
const EstimateCtx = createContext<EstimateController>({ open: () => {} });

/**
 * Ideas. A destination you browse, but opened from a journey's menu it is a
 * window over that journey, not a page you have to find your way back from
 * (Brennan, Sep 2026). The /ideas route still exists for links and the
 * masthead's own tab.
 */
interface IdeasController {
  open: (from?: { id: string; title: string } | null) => void;
}
const IdeasCtx = createContext<IdeasController>({ open: () => {} });
export const useIdeas = () => useContext(IdeasCtx);
export const useEstimate = () => useContext(EstimateCtx);

interface ProfileController {
  open: () => void;
}
const ProfileCtx = createContext<ProfileController>({ open: () => {} });
export const useProfile = () => useContext(ProfileCtx);

/**
 * Journey notes. Notes are trip CONTENT — the gate code, what to pack — not
 * configuration, so they open from a glyph beside the journey's tabs rather
 * than from inside Settings, and from anywhere without a page change.
 */
interface JourneyNotesController {
  open: (tripId: string, initialNotes?: string | null) => void;
}
const JourneyNotesCtx = createContext<JourneyNotesController>({ open: () => {} });
export const useJourneyNotes = () => useContext(JourneyNotesCtx);

/** Mounted once, in (app)/layout, inside GlobalSearchProvider. */
export function AppOverlaysProvider({ children }: { children: ReactNode }) {
  return (
    <NewJourneyProvider>
      <TripSettingsProvider>
        <ProfileProvider>
          <EstimateProvider>
            <IdeasProvider>
              <JourneyNotesProvider>{children}</JourneyNotesProvider>
            </IdeasProvider>
          </EstimateProvider>
        </ProfileProvider>
      </TripSettingsProvider>
    </NewJourneyProvider>
  );
}

// ── Plan a journey ────────────────────────────────────────────────────────

function NewJourneyProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  // The nonce keys the form: each open starts from its own seed rather than
  // reviving whatever half-typed state the last one left in useState.
  const [request, setRequest] = useState<{ seed: NewJourneySeed | null; nonce: number } | null>(null);

  const open = useCallback((seed?: NewJourneySeed | null) => {
    setRequest((prev) => ({ seed: seed ?? null, nonce: (prev?.nonce ?? 0) + 1 }));
  }, []);
  const close = useCallback(() => setRequest(null), []);
  const value = useMemo(() => ({ open }), [open]);

  return (
    <NewJourneyCtx.Provider value={value}>
      {children}
      {request && (
        <Overlay onClose={close} label="Plan a journey">
          <NewJourneyForm
            key={request.nonce}
            seed={request.seed}
            variant="overlay"
            onDismiss={close}
            // Creating a journey still opens it — close first so the traveller
            // lands on the new day rather than on a screen behind a sheet.
            // The form decides where (Day 1 of the Agenda; see NewJourneyForm).
            onCreated={(_tripId, landing) => {
              close();
              router.push(landing);
            }}
          />
        </Overlay>
      )}
    </NewJourneyCtx.Provider>
  );
}

// ── Estimate ────────────────────────────────

function EstimateProvider({ children }: { children: ReactNode }) {
  const [tripId, setTripId] = useState<string | null>(null);
  const open = useCallback((id: string) => setTripId(id), []);
  const close = useCallback(() => setTripId(null), []);
  const value = useMemo(() => ({ open }), [open]);

  return (
    <EstimateCtx.Provider value={value}>
      {children}
      {tripId && (
        <Overlay onClose={close} label="Estimate">
          <EstimateOverlayBody tripId={tripId} onClose={close} />
        </Overlay>
      )}
    </EstimateCtx.Provider>
  );
}

/** Reads the same loader the route uses, through the browser client. */
function EstimateOverlayBody({
  tripId,
  onClose,
}: {
  tripId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<EstimateData | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadEstimate(createClient(), tripId)
      .then((d) => {
        if (cancelled) return;
        if (d) setData(d);
        else setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  if (failed) {
    return (
      <p className="px-5 py-10 text-center text-[13px] text-gray-400">
        Couldn&rsquo;t load the estimate.
      </p>
    );
  }
  if (!data) {
    return (
      <p className="px-5 py-10 text-center text-[13px] text-gray-400">Loading&hellip;</p>
    );
  }
  return (
    <EstimateClient
      tripId={tripId}
      tripTitle={data.tripTitle}
      initialAssumptions={data.assumptions}
      initialBasis={data.basis}
      uncostedExcursions={data.uncostedExcursions}
      rolledExcursionCount={data.rolledExcursionCount}
      fxToCad={data.fxToCad}
      fxSource={data.fxSource}
      fxReferenceMonth={data.fxReferenceMonth}
      cardCurrency={data.cardCurrency}
      excursionItems={data.excursionItems}
      excursionFree={data.excursionFree}
      dateRange={data.dateRange}
      distanceKm={data.distanceKm}
      peak={data.peak}
      variant="overlay"
      onDismiss={onClose}
    />
  );
}

// ── Ideas ─────────────────────────────────────────────────────────────────

function IdeasProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<{ from: { id: string; title: string } | null; nonce: number } | null>(null);
  const open = useCallback((from?: { id: string; title: string } | null) => {
    setRequest((prev) => ({ from: from ?? null, nonce: (prev?.nonce ?? 0) + 1 }));
  }, []);
  const close = useCallback(() => setRequest(null), []);
  const value = useMemo(() => ({ open }), [open]);

  return (
    <IdeasCtx.Provider value={value}>
      {children}
      {request && (
        <Overlay onClose={close} label="Ideas">
          <IdeasOverlayBody key={request.nonce} from={request.from} onClose={close} />
        </Overlay>
      )}
    </IdeasCtx.Provider>
  );
}

/** The same two reads the /ideas route makes, through the browser client. */
function IdeasOverlayBody({
  from,
  onClose,
}: {
  from: { id: string; title: string } | null;
  onClose: () => void;
}) {
  const [data, setData] = useState<{ ideas: Idea[]; journeys: JourneySummary[] } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setFailed(true); return; }
      const today = new Date().toISOString().slice(0, 10);
      const [{ data: ideas, error: e1 }, { data: trips, error: e2 }] = await Promise.all([
        supabase
          .from("ideas")
          .select("id, url, title, note, source, status, tags, created_at, wishlist_destination_id, pins_added, pinned_trip_id, place")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("trips")
          .select("id, title, destination, destination_lat, destination_lng, end_date, archived")
          .eq("user_id", user.id)
          .gte("end_date", today)
          .order("start_date", { ascending: true }),
      ]);
      if (cancelled) return;
      if (e1 || e2) { setFailed(true); return; }
      setData({ ideas: (ideas ?? []) as Idea[], journeys: (trips ?? []) as JourneySummary[] });
    };
    void run();
    return () => { cancelled = true; };
  }, []);

  if (failed) {
    return <p className="px-5 py-10 text-center text-[13px] text-gray-400">Couldn&rsquo;t load your ideas.</p>;
  }
  if (!data) {
    return <p className="px-5 py-10 text-center text-[13px] text-gray-400">Loading&hellip;</p>;
  }
  return (
    <IdeasClient
      initial={data.ideas}
      journeys={data.journeys}
      backTo={from ? { href: "/trips/" + from.id, title: from.title } : null}
      variant="overlay"
      onDismiss={onClose}
    />
  );
}

/** Trigger — a real link to /ideas, the overlay on a plain click. */
export function IdeasLink({
  from = null,
  className,
  style,
  title,
  ariaLabel,
  role,
  children,
  onBeforeOpen,
}: TriggerProps & { from?: { id: string; title: string } | null }) {
  const { open } = useIdeas();
  return (
    <Link
      href={from ? "/ideas?from=" + from.id : "/ideas"}
      prefetch={false}
      className={className}
      style={style}
      title={title}
      aria-label={ariaLabel}
      role={role}
      onClick={(e) => {
        if (opensElsewhere(e)) return;
        e.preventDefault();
        onBeforeOpen?.();
        open(from);
      }}
    >
      {children}
    </Link>
  );
}

/** Trigger — a real link to the route, overlay on a plain click. */
export function EstimateLink({
  tripId,
  className,
  style,
  title,
  ariaLabel,
  role,
  children,
  onBeforeOpen,
}: TriggerProps & { tripId: string }) {
  const { open } = useEstimate();
  return (
    <Link
      href={"/trips/" + tripId + "/estimate"}
      prefetch={false}
      className={className}
      style={style}
      title={title}
      aria-label={ariaLabel}
      role={role}
      onClick={(e) => {
        if (opensElsewhere(e)) return;
        e.preventDefault();
        onBeforeOpen?.();
        open(tripId);
      }}
    >
      {children}
    </Link>
  );
}

// ── Profile ───────────────────────────────────────────────────────────────

function ProfileProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const value = useMemo(() => ({ open }), [open]);

  return (
    <ProfileCtx.Provider value={value}>
      {children}
      {isOpen && (
        <Overlay onClose={close} label="Profile">
          {/* No initial data: the form reads the traveller's own row through
              the browser client behind a small loading state, so the overlay
              opens instantly from anywhere in the app. */}
          <ProfileForm variant="overlay" onDismiss={close} />
        </Overlay>
      )}
    </ProfileCtx.Provider>
  );
}

// ── Journey notes ─────────────────────────────────────────────────────────

function JourneyNotesProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<
    { tripId: string; initialNotes: string | null; nonce: number } | null
  >(null);
  const [loaded, setLoaded] = useState<string | null>(null);

  const open = useCallback((tripId: string, initialNotes?: string | null) => {
    setLoaded(initialNotes ?? null);
    setRequest((prev) => ({
      tripId,
      initialNotes: initialNotes ?? null,
      nonce: (prev?.nonce ?? 0) + 1,
    }));
  }, []);
  const close = useCallback(() => setRequest(null), []);
  const value = useMemo(() => ({ open }), [open]);

  // Opened from a surface that doesn't already hold the journey's notes (the
  // masthead glyph, say): fetch them behind the open rather than blocking it.
  useEffect(() => {
    if (!request || request.initialNotes != null) return;
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("trips")
      .select("notes")
      .eq("id", request.tripId)
      .single()
      .then(({ data }) => {
        if (!cancelled) setLoaded((data as { notes: string | null } | null)?.notes ?? "");
      });
    return () => { cancelled = true; };
  }, [request]);

  return (
    <JourneyNotesCtx.Provider value={value}>
      {children}
      {request && (
        <JourneyNotesSheet
          key={request.nonce}
          tripId={request.tripId}
          initialNotes={loaded}
          onClose={close}
        />
      )}
    </JourneyNotesCtx.Provider>
  );
}

// ── Trip settings ─────────────────────────────────────────────────────────

interface TripSettingsRequest {
  tripId: string;
  section: "share" | "notes" | "entry" | null;
  seed: { trip?: Trip; days?: Day[] };
  nonce: number;
}

function TripSettingsProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<TripSettingsRequest | null>(null);

  const open = useCallback((tripId: string, opts?: TripSettingsOpenOptions) => {
    setRequest((prev) => ({
      tripId,
      section: opts?.section ?? null,
      seed: { trip: opts?.trip, days: opts?.days },
      nonce: (prev?.nonce ?? 0) + 1,
    }));
  }, []);
  const close = useCallback(() => setRequest(null), []);
  const value = useMemo(() => ({ open }), [open]);

  return (
    <TripSettingsCtx.Provider value={value}>
      {children}
      {request && (
        <Overlay onClose={close} label="Journey settings">
          <TripSettingsBody
            key={request.nonce}
            tripId={request.tripId}
            section={request.section}
            seed={request.seed}
            onClose={close}
          />
        </Overlay>
      )}
    </TripSettingsCtx.Provider>
  );
}

/**
 * Loads what the settings screen needs that the opener couldn't hand over.
 *
 * Deliberately not blocking the open: the sheet is on screen the instant it
 * is asked for, and the form replaces this frame when the reads land. The
 * trip and its days usually arrive as props (the Day view and the Plan board
 * already hold both), leaving only travellers and the sharing state.
 */
function TripSettingsBody({
  tripId,
  section,
  seed,
  onClose,
}: {
  tripId: string;
  section: "share" | "notes" | "entry" | null;
  seed: { trip?: Trip; days?: Day[] };
  onClose: () => void;
}) {
  const router = useRouter();
  const [trip, setTrip] = useState<Trip | null>(seed.trip ?? null);
  const [days, setDays] = useState<Day[] | null>(seed.days ?? null);
  const [people, setPeople] = useState<Person[] | null>(null);
  const [share, setShare] = useState<ShareState | null>(null);
  const [blocked, setBlocked] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    // Settings is owner-only — the page redirects a guest, and every trigger
    // is already hidden from one. This is the same guard for the overlay.
    isTripGuest(tripId).then((guest) => {
      if (!cancelled && guest) setBlocked("Only the journey's owner can change its settings.");
    });

    if (!seed.trip) {
      supabase
        .from("trips")
        .select("*")
        .eq("id", tripId)
        .maybeSingle()
        .then(({ data }) => {
          if (cancelled) return;
          if (data) setTrip(data as Trip);
          else setBlocked("This journey is no longer available.");
        });
    }

    if (!seed.days) {
      supabase
        .from("days")
        .select("*")
        .eq("trip_id", tripId)
        .order("day_number")
        .then(({ data }) => {
          if (!cancelled) setDays((data ?? []) as Day[]);
        });
    }

    supabase
      .from("people")
      .select("id, name, birthdate, notes, position")
      .eq("trip_id", tripId)
      .order("position", { ascending: true })
      .then(({ data }) => {
        if (!cancelled) setPeople((data ?? []) as Person[]);
      });

    // Service-role read — the share token's siblings and a guest's user row
    // are not readable by the owner under RLS. Failing it hides the Share
    // section rather than the whole screen.
    loadShareState(tripId)
      .then((s) => {
        if (!cancelled) setShare(s);
      })
      .catch(() => {
        if (!cancelled) setShare({ shareAvailable: false, shareToken: null, guests: [] });
      });

    return () => {
      cancelled = true;
    };
    // `seed` is read once, at mount; the body remounts per open (see the
    // nonce key above), so it can never go stale.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  if (blocked) {
    return (
      <SettingsFrame onClose={onClose}>
        <p className="px-5 py-10 text-center text-[13px] text-gray-400">{blocked}</p>
      </SettingsFrame>
    );
  }

  if (!trip || !days || !people || !share) {
    return (
      <SettingsFrame onClose={onClose}>
        <p className="px-5 py-10 text-center text-[13px] text-gray-400">Loading…</p>
      </SettingsFrame>
    );
  }

  return (
    <TripSettingsClient
      trip={trip}
      days={days}
      initialPeople={people}
      initialShareToken={share.shareToken}
      initialGuests={share.guests}
      shareAvailable={share.shareAvailable}
      variant="overlay"
      onDismiss={onClose}
      // Saving rewrites trips and days; the screen underneath was server
      // rendered from both, so refresh it and get out of the way.
      onSaved={() => {
        onClose();
        router.refresh();
      }}
      // Archived, restored or deleted — there is no journey to go back to.
      onLeft={() => {
        onClose();
        router.push("/trips");
        router.refresh();
      }}
      scrollTo={section}
    />
  );
}

/** The settings header on its own, for the loading and blocked states. */
function SettingsFrame({ onClose, children }: { onClose: () => void; children: ReactNode }) {
  return (
    <div className="flex flex-col h-full min-h-0 bg-white">
      <div className="flex items-center h-11 border-b border-gray-100 flex-shrink-0 relative bg-white">
        <button
          onClick={onClose}
          className="flex items-center justify-center w-11 h-11 text-gray-500 hover:text-gray-800 transition-colors flex-shrink-0"
          aria-label="Close"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
        <span className="absolute left-0 right-0 text-center text-[16px] font-semibold text-gray-900 pointer-events-none">
          Settings
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
    </div>
  );
}

// ── Triggers ──────────────────────────────────────────────────────────────
// Every one is a real link first and an overlay trigger second. Holding
// ctrl/cmd (or shift/alt) still opens the route in a new tab or window, which
// is exactly what someone reaching for "open in new tab" expects.

/** True when the browser should be left to follow the href itself. */
function opensElsewhere(e: MouseEvent<HTMLAnchorElement>): boolean {
  return e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0;
}

interface TriggerProps {
  className?: string;
  style?: CSSProperties;
  title?: string;
  ariaLabel?: string;
  role?: string;
  children: ReactNode;
  /** Runs before the overlay opens — closes the menu the trigger sits in. */
  onBeforeOpen?: () => void;
}

export function NewJourneyLink({
  seed = null,
  className,
  style,
  title,
  ariaLabel,
  children,
  onBeforeOpen,
}: TriggerProps & { seed?: NewJourneySeed | null }) {
  const { open } = useNewJourney();
  return (
    <Link
      href={buildNewJourneyHref(seed)}
      // The overlay is the real destination; the href exists for modified
      // clicks, which open a new tab and never use a client prefetch.
      prefetch={false}
      className={className}
      style={style}
      title={title}
      aria-label={ariaLabel}
      onClick={(e) => {
        if (opensElsewhere(e)) return;
        e.preventDefault();
        onBeforeOpen?.();
        open(seed);
      }}
    >
      {children}
    </Link>
  );
}

export function ProfileLink({
  className,
  style,
  title,
  ariaLabel,
  role,
  children,
  onBeforeOpen,
}: TriggerProps) {
  const { open } = useProfile();
  return (
    <Link
      href="/profile"
      // The overlay is the real destination; the href exists for modified
      // clicks, which open a new tab and never use a client prefetch.
      prefetch={false}
      className={className}
      style={style}
      title={title}
      aria-label={ariaLabel}
      role={role}
      onClick={(e) => {
        if (opensElsewhere(e)) return;
        e.preventDefault();
        onBeforeOpen?.();
        open();
      }}
    >
      {children}
    </Link>
  );
}

export function TripSettingsLink({
  tripId,
  section,
  trip,
  days,
  className,
  style,
  title,
  ariaLabel,
  role,
  children,
  onBeforeOpen,
}: TriggerProps & {
  tripId: string;
  section?: "share" | "notes" | "entry";
  /** Optional seed — pass whatever the opening screen already holds. */
  trip?: Trip;
  days?: Day[];
}) {
  const { open } = useTripSettings();
  const href = `/trips/${tripId}/settings${section ? `#${section}` : ""}`;
  return (
    <Link
      href={href}
      // The overlay is the real destination; the href exists for modified
      // clicks, which open a new tab and never use a client prefetch.
      prefetch={false}
      className={className}
      style={style}
      title={title}
      aria-label={ariaLabel}
      role={role}
      onClick={(e) => {
        if (opensElsewhere(e)) return;
        e.preventDefault();
        onBeforeOpen?.();
        open(tripId, { section, trip, days });
      }}
    >
      {children}
    </Link>
  );
}
