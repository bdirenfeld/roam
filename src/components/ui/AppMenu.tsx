"use client";

import { useEffect, useRef, useState } from "react";
import {
  Coins,
  Compass,
  DotsThree,
  Gear,
  MagnifyingGlass,
  NotePencil,
  ShareNetwork,
} from "@phosphor-icons/react";
import {
  EstimateLink,
  NewJourneyLink,
  TripSettingsLink,
  useJourneyNotes,
} from "@/components/overlays/AppOverlays";
import { useGlobalSearch } from "@/components/search/GlobalSearch";
import ShareJourneySheet from "@/components/trip/ShareJourneySheet";
import type { Trip, Day } from "@/types/database";

const INK = "#1A1A2E";
const CAPTION = "rgba(26,26,46,0.55)";
const SOFT = "rgba(26,26,46,0.42)";
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
  showSearch = false,
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
  /** Desktop has a labelled Search button of its own; a phone does not. */
  showSearch?: boolean;
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
  const search = useGlobalSearch();

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

  const Label = ({ title, sub }: { title: string; sub: string }) => (
    <span>
      <span style={{ display: "block", fontSize: mobile ? 13 : 14, color: INK, lineHeight: 1.3, fontWeight: mobile ? 500 : 400 }}>
        {title}
      </span>
      <span style={{ display: "block", fontSize: mobile ? 11 : 11.5, color: SOFT, marginTop: 1 }}>
        {sub}
      </span>
    </span>
  );

  const owner = !guest;

  return (
    <div ref={ref} className={`relative flex-shrink-0 ${wrapperClassName ?? ""}`}>
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
                  background: "#FAF7F2",
                  border: `1px solid ${RULE}`,
                  boxShadow: "0 16px 34px rgba(26,26,46,0.17)",
                  padding: 7,
                }
          }
        >
          {/* The phone's only route to search — the app header that carries it
              doesn't render inside a journey. */}
          {showSearch && (
            <button
              role="menuitem"
              onClick={() => { setOpen(false); search.open(); }}
              style={itemStyle}
            >
              <span style={glyphStyle}>
                <MagnifyingGlass size={15} weight="light" />
              </span>
              <Label title="Search" sub="Journeys, places, wishlist" />
            </button>
          )}

          <NewJourneyLink
            title="Plan a journey"
            ariaLabel="Plan a journey"
            onBeforeOpen={() => setOpen(false)}
            style={itemStyle}
          >
            <span style={glyphStyle}>
              <Compass size={15} weight="light" />
            </span>
            <Label title="Plan a journey" sub="Somewhere new, from scratch" />
          </NewJourneyLink>

          {tripId && (
            <>
              <div
                style={{
                  height: 1,
                  background: "rgba(26,26,46,0.08)",
                  margin: mobile ? "4px 0" : "5px 11px",
                }}
              />

              <button
                role="menuitem"
                onClick={() => { setOpen(false); notes.open(tripId); }}
                style={itemStyle}
              >
                <span style={glyphStyle}>
                  <NotePencil size={15} weight="light" />
                </span>
                <Label title="Journey notes" sub="Codes, packing, who’s driving" />
              </button>

              {owner && (
                <button
                  role="menuitem"
                  onClick={() => { setOpen(false); setShowShare(true); }}
                  style={itemStyle}
                >
                  <span style={glyphStyle}>
                    <ShareNetwork size={15} weight="light" />
                  </span>
                  <Label title="Share journey" sub="Email it, or send a link" />
                </button>
              )}

              {/* The estimate is the owner's own figure — never a guest's. */}
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
                  <Label title="Estimate" sub="Flights, villa, excursions" />
                </EstimateLink>
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
                  <Label title="Journey settings" sub="Dates, travellers, cover" />
                </TripSettingsLink>
              )}
            </>
          )}

          {extra && extra.length > 0 && (
            <>
              <div
                style={{
                  height: 1,
                  background: "rgba(26,26,46,0.08)",
                  margin: mobile ? "4px 0" : "5px 11px",
                }}
              />
              {extra.map((item) => (
                <button
                  key={item.key}
                  role="menuitem"
                  onClick={() => { setOpen(false); item.onClick(); }}
                  style={itemStyle}
                >
                  <span style={glyphStyle}>{item.icon}</span>
                  <Label title={item.title} sub={item.sub} />
                </button>
              ))}
            </>
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
