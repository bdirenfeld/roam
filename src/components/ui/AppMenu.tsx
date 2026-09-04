"use client";

import { useEffect, useRef, useState } from "react";
import {
  Coins,
  DotsThree,
  Gear,
  NotePencil,
  ShareNetwork,
  Lightbulb,
} from "@phosphor-icons/react";
import Link from "next/link";
import {
  EstimateLink,
  TripSettingsLink,
  useJourneyNotes,
} from "@/components/overlays/AppOverlays";
import ShareJourneySheet from "@/components/trip/ShareJourneySheet";
import type { Trip, Day } from "@/types/database";

const INK = "#1A1A2E";
const CAPTION = "rgba(26,26,46,0.55)";
const RULE = "rgba(26,26,46,0.12)";

/**
 * The app's one overflow menu.
 *
 * There used to be two: DayMenu inside the day view for phones, and
 * MastheadMenu in the desktop masthead. Same idea, same wording, separate code
 * — so every new destination had to be added twice, and three times in one day
 * it wasn't: the Estimate entry point, Ideas, and the email invite each shipped
 * reachable on a desktop and invisible on a phone. Brennan found all three.
 *
 * One component ends that. The two breakpoints differ in presentation only —
 * where it anchors and how wide it is. What is *in* it is decided by context,
 * never by screen size: journey items appear when there is a journey, and
 * owner-only items when you are not a guest.
 *
 * The one genuine exception is Search, which the desktop masthead already
 * carries as its own labelled button; a phone has nowhere else to put it.
 */
export default function AppMenu({
  variant,
  tripId,
  tripTitle,
  trip,
  days,
  guest = false,
  triggerClassName,
  wrapperClassName,
  extra,
}: {
  variant: "mobile" | "desktop";
  tripId: string | null;
  tripTitle: string | null;
  /** Seeds the Settings overlay — the day view already holds both. */
  trip?: Trip;
  days?: Day[];
  guest?: boolean;
  triggerClassName: string;
  /** Positions the whole control (trigger + menu); the map floats it. */
  wrapperClassName?: string;
  /**
   * Rows a host adds under the shared ones — the Plan board's "Change
   * background", "Import a booking", "Documents". They render in the same
   * register as the rest, so the menu reads as one list, not two.
   */
  extra?: { key: string; title: string; sub: string; icon: React.ReactNode; onClick: () => void }[];
}) {
  const [open, setOpen] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const notes = useJourneyNotes();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const mobile = variant === "mobile";

  const itemStyle: React.CSSProperties = {
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
    padding: mobile ? "10px 12px" : "9px 10px",
    borderRadius: mobile ? 0 : 9,
    width: "100%",
    textAlign: "left",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    textDecoration: "none",
  };

  const glyphStyle: React.CSSProperties = {
    width: 28,
    height: 28,
    borderRadius: 8,
    background: mobile ? "#F3F4F6" : "#FFFFFF",
    border: mobile ? "none" : `1px solid ${RULE}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: CAPTION,
    flex: "none",
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const Label = ({ title, sub: _sub }: { title: string; sub?: string }) => (
    <span style={{ display: "block", fontSize: mobile ? 14 : 14, color: INK, lineHeight: 1.3, fontWeight: mobile ? 500 : 400, alignSelf: "center" }}>
      {title}
    </span>
  );

  const owner = !guest;

  return (
    // A host that floats the control passes its own positioning; the default
    // is `relative` so the dropdown anchors to the trigger. Never both: with
    // `relative` and `absolute` on one element Tailwind's later rule wins and
    // the map's floated menu landed in flow, under the canvas.
    <div ref={ref} className={`flex-shrink-0 ${wrapperClassName ?? "relative"}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={triggerClassName}
        title="More"
        aria-label="More options"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <DotsThree size={mobile ? 20 : 18} weight={mobile ? "light" : "bold"} />
      </button>

      {open && (
        <div
          role="menu"
          className={
            mobile
              ? "absolute right-0 top-full mt-1.5 z-50 bg-white/97 backdrop-blur-xl rounded-xl shadow-xl w-[236px] py-1 overflow-hidden"
              : "absolute right-0 z-[60] rounded-xl"
          }
          style={
            mobile
              ? undefined
              : {
                  top: "calc(100% + 8px)",
                  width: 288,
                  background: "#FFFFFF",
                  border: `1px solid ${RULE}`,
                  boxShadow: "0 16px 34px rgba(26,26,46,0.17)",
                  padding: 7,
                }
          }
        >
          {tripId && (
            <>
              <button
                role="menuitem"
                onClick={() => { setOpen(false); notes.open(tripId); }}
                style={itemStyle}
              >
                <span style={glyphStyle}>
                  <NotePencil size={15} weight="light" />
                </span>
                <Label title="Journey notes" />
              </button>

              {/* One order on every tab, most-used first: notes and bookings
                  daily, Ideas where new things arrive, Estimate and Share
                  now and then, Settings last. No dividers — six plain rows
                  (Brennan, from his phone, Sep 2026). */}
              {extra?.map((item) => (
                <button
                  key={item.key}
                  role="menuitem"
                  onClick={() => { setOpen(false); item.onClick(); }}
                  style={itemStyle}
                >
                  <span style={glyphStyle}>{item.icon}</span>
                  <Label title={item.title} />
                </button>
              ))}

              <Link
                href={`/ideas?from=${tripId}`}
                role="menuitem"
                onClick={() => setOpen(false)}
                style={itemStyle}
              >
                <span style={glyphStyle}>
                  <Lightbulb size={15} weight="light" />
                </span>
                <Label title="Ideas" />
              </Link>

              {owner && (
                <EstimateLink
                  tripId={tripId}
                  role="menuitem"
                  ariaLabel="Estimate"
                  onBeforeOpen={() => setOpen(false)}
                  style={itemStyle}
                >
                  <span style={glyphStyle}>
                    <Coins size={15} weight="light" />
                  </span>
                  <Label title="Estimate" />
                </EstimateLink>
              )}

              {owner && (
                <button
                  role="menuitem"
                  onClick={() => { setOpen(false); setShowShare(true); }}
                  style={itemStyle}
                >
                  <span style={glyphStyle}>
                    <ShareNetwork size={15} weight="light" />
                  </span>
                  <Label title="Share journey" />
                </button>
              )}

              {/* Settings used to sit in the profile dropdown on desktop and in
                  this menu on a phone — the same screen behind two different
                  doors depending on the width. It belongs with the journey. */}
              {owner && (
                <TripSettingsLink
                  tripId={tripId}
                  trip={trip}
                  days={days}
                  role="menuitem"
                  ariaLabel="Journey settings"
                  onBeforeOpen={() => setOpen(false)}
                  style={itemStyle}
                >
                  <span style={glyphStyle}>
                    <Gear size={15} weight="light" />
                  </span>
                  <Label title="Journey settings" />
                </TripSettingsLink>
              )}
            </>
          )}

          {/* Off a journey (the Journeys index at desktop width) the menu is
              just Ideas; the masthead carries Search, Plan a journey and the
              avatar. */}
          {!tripId && (
            <Link
              href="/ideas"
              role="menuitem"
              onClick={() => setOpen(false)}
              style={itemStyle}
            >
              <span style={glyphStyle}>
                <Lightbulb size={15} weight="light" />
              </span>
              <Label title="Ideas" />
            </Link>
          )}
        </div>
      )}

      {showShare && tripId && (
        <ShareJourneySheet
          tripId={tripId}
          tripTitle={tripTitle ?? "this journey"}
          onClose={() => setShowShare(false)}
        />
      )}
    </div>
  );
}
