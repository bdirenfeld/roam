"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserCircle } from "@phosphor-icons/react";
import { createClient } from "@/lib/supabase/client";
import { signOut } from "@/lib/auth-actions";

const INK = "#1A1A2E";
const RULE = "rgba(26,26,46,0.10)";
const CAPTION = "rgba(26,26,46,0.55)";

type UserSummary = { name: string | null; email: string | null };

// Module-level cache — survives client navigations and avoids re-hitting
// supabase.auth.getUser() on every masthead mount or dropdown open.
let USER_CACHE: UserSummary | null = null;

/**
 * Desktop-only masthead. Renders at ≥768px above the (app) content area.
 */
export default function DesktopMasthead() {
  const pathname = usePathname() ?? "";
  const onJourneys = !pathname.startsWith("/trips/");

  const [user, setUser] = useState<UserSummary | null>(USER_CACHE);
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (USER_CACHE) return;
    let cancelled = false;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user: u } }) => {
      if (cancelled || !u) return;
      const meta = u.user_metadata ?? {};
      const next: UserSummary = {
        name:
          (meta.full_name as string | undefined) ??
          (meta.name as string | undefined) ??
          null,
        email: u.email ?? null,
      };
      USER_CACHE = next;
      setUser(next);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

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

      {/* Plan a journey — masthead-global new-trip entry, matches design canvas. */}
      <Link
        href="/trips/new"
        title="Plan a journey"
        aria-label="Plan a journey"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: CAPTION,
          padding: 8,
          marginRight: 6,
          textDecoration: "none",
        }}
      >
        <svg
          width="17"
          height="17"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 5v14M5 12h14" />
        </svg>
      </Link>

      {/* Profile dropdown — replaces the previous direct-link avatar. */}
      <div ref={menuRef} style={{ position: "relative" }}>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="Profile menu"
          aria-haspopup="menu"
          aria-expanded={open}
          style={{
            display: "inline-flex",
            alignItems: "center",
            color: INK,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: 0,
          }}
        >
          <UserCircle size={30} weight="light" />
        </button>

        {open && (
          <div
            role="menu"
            style={{
              position: "absolute",
              right: 0,
              top: "calc(100% + 10px)",
              width: 224,
              background: "#fff",
              border: `1px solid ${RULE}`,
              borderRadius: 12,
              boxShadow: "0 6px 20px rgba(26,26,46,0.10)",
              overflow: "hidden",
              zIndex: 50,
            }}
          >
            <div style={{ padding: "14px 16px", borderBottom: `1px solid ${RULE}` }}>
              <div
                className="font-display italic"
                style={{
                  fontWeight: 500,
                  fontSize: 15,
                  color: INK,
                  letterSpacing: "-0.005em",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {user?.name ?? "Signed in"}
              </div>
              {user?.email && (
                <div
                  style={{
                    fontSize: 11,
                    color: CAPTION,
                    letterSpacing: "0.06em",
                    marginTop: 3,
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {user.email}
                </div>
              )}
            </div>
            <Link
              href="/profile"
              role="menuitem"
              onClick={() => setOpen(false)}
              style={{
                display: "block",
                padding: "11px 16px",
                fontSize: 13,
                color: INK,
                textDecoration: "none",
              }}
            >
              Profile
            </Link>
            <form action={signOut}>
              <button
                type="submit"
                role="menuitem"
                onClick={() => setOpen(false)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "11px 16px",
                  fontSize: 13,
                  color: INK,
                  background: "transparent",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "inherit",
                }}
              >
                Sign out
              </button>
            </form>
          </div>
        )}
      </div>
    </header>
  );
}
