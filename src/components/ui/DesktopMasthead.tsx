"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserCircle } from "@phosphor-icons/react";

const INK = "#1A1A2E";
const RULE = "rgba(26,26,46,0.10)";
const CAPTION = "rgba(26,26,46,0.55)";

/**
 * Desktop-only masthead. Renders at ≥768px above the (app) content area.
 * Phase A: minimal — wordmark + "Journeys" link + avatar placeholder.
 * Trip context + tab strip get added in a later brief.
 */
export default function DesktopMasthead() {
  const pathname = usePathname() ?? "";
  // "Journeys" reads active on the trips list and other non-trip-context surfaces.
  const onJourneys = !pathname.startsWith("/trips/");

  return (
    <header
      className="hidden md:flex"
      style={{
        height: 64,
        paddingLeft: 28,
        paddingRight: 28,
        alignItems: "center",
        borderBottom: `1px solid ${RULE}`,
        background: "#FAF7F2",
        color: INK,
      }}
    >
      <Link
        href="/trips"
        className="font-display italic"
        style={{
          fontWeight: 500,
          fontSize: 24,
          letterSpacing: "-0.015em",
          color: INK,
          textDecoration: "none",
        }}
      >
        Roam
      </Link>

      <div
        style={{
          width: 1,
          height: 22,
          background: RULE,
          margin: "0 22px",
        }}
      />

      <nav style={{ display: "flex", alignItems: "center" }}>
        <Link
          href="/trips"
          className="font-display italic"
          style={{
            padding: "6px 2px",
            fontWeight: onJourneys ? 500 : 400,
            fontSize: 17,
            color: onJourneys ? INK : CAPTION,
            letterSpacing: "-0.005em",
            borderBottom: onJourneys ? `1px solid ${INK}` : "1px solid transparent",
            textDecoration: "none",
          }}
        >
          Journeys
        </Link>
      </nav>

      <div style={{ flex: 1 }} />

      <Link
        href="/profile"
        aria-label="Profile"
        style={{ display: "inline-flex", color: INK }}
      >
        <UserCircle size={30} weight="light" />
      </Link>
    </header>
  );
}
