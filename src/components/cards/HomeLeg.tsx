"use client";

/**
 * "Getting to the airport" / "Getting home" under a flight's boarding pass
 * (19 Nov 2026, approved mock). Only on the flight that leaves from, or lands
 * at, your home airport, and only for you (your Profile's home address).
 * Logic: lib/flights/homeLegs. The drive is Google's drive time, asked once
 * and kept on the card (details.home_drive) so the week can draw it too.
 */

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getAuthUser } from "@/lib/supabase/authUser";
import { formatTimeValue } from "@/lib/formatTime";
import { homeKeyOf, minsLabel, homeRole, homeCode, homePlan, type LeavingPlan, type ReturningPlan } from "@/lib/flights/homeLegs";
import { flightPass } from "@/lib/flights/pass";

export interface Home { airport: string | null; lat: number; lng: number; key: string }

/** Your home (Profile): the airport and where you live. Null until both are set. */
export function useHome(enabled: boolean): Home | null {
  const [home, setHome] = useState<Home | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let off = false;
    (async () => {
      const supabase = createClient();
      const user = await getAuthUser(supabase).catch(() => null);
      if (!user || off) return;
      const { data } = await supabase.from("users").select("home_airport, home_lat, home_lng").eq("id", user.id).maybeSingle();
      const d = data as { home_airport?: string | null; home_lat?: number | null; home_lng?: number | null } | null;
      if (!off && d && typeof d.home_lat === "number" && typeof d.home_lng === "number") {
        setHome({ airport: d.home_airport ?? null, lat: d.home_lat, lng: d.home_lng, key: homeKeyOf(d.home_lat, d.home_lng) });
      }
    })();
    return () => { off = true; };
  }, [enabled]);
  return home;
}

/** Where the home airport is: the card's own place when it is that airport, else Google's answer for "YYZ airport". */
export async function airportPoint(code: string, place: { lat?: number | null; lng?: number | null; title?: string | null; address?: string | null } | null | undefined): Promise<{ lat: number; lng: number } | null> {
  const text = `${place?.title ?? ""} ${place?.address ?? ""}`;
  if (place?.lat != null && place?.lng != null && new RegExp(`\\b${code}\\b`).test(text)) return { lat: place.lat, lng: place.lng };
  try {
    const ac = await fetch(`/api/places/autocomplete?input=${encodeURIComponent(`${code} airport`)}`).then((r) => r.json()) as { predictions?: { place_id: string }[] };
    const id = ac.predictions?.[0]?.place_id;
    if (!id) return null;
    const det = await fetch(`/api/places/details?place_id=${encodeURIComponent(id)}`).then((r) => r.json()) as { result?: { geometry?: { location?: { lat: number; lng: number } } } };
    return det.result?.geometry?.location ?? null;
  } catch {
    return null;
  }
}

/** Google's drive time between two points with traffic for that weekday and hour, in minutes (cached a month). */
export async function driveMinutes(from: { lat: number; lng: number }, to: { lat: number; lng: number }, date: string | null, hour: number): Promise<number | null> {
  try {
    const r = await fetch("/api/travel/estimate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from, to, date, hour, traffic: true }) }).then((x) => x.json()) as { drive?: number | null };
    return typeof r.drive === "number" ? r.drive : null;
  } catch {
    return null;
  }
}

const BLUE = "#4A6F9E";
const t = (v: string | null) => (v ? formatTimeValue(v) : "–");

export function HomeLegRows({ plan, airportName, readOnly, onSave, clockCity = null }: {
  plan: LeavingPlan | ReturningPlan; airportName: string; readOnly: boolean; onSave: (field: string, value: number) => void;
  /** "Toronto": coming home, the times are on home's clock, and the box says so (19 Nov 2026). */
  clockCity?: string | null;
}) {
  const Row = ({ when, what, sub, big, action }: { when: string; what: string; sub?: string; big?: boolean; action?: React.ReactNode }) => (
    <div className="flex items-baseline gap-3 py-1">
      <span className={`flex-shrink-0 w-[68px] font-bold ${big ? "text-[15px]" : "text-[13px]"}`} style={{ color: "#1A1A2E" }}>{when}</span>
      <span className="flex-1 min-w-0">
        <span className={`block ${big ? "text-[15px] font-bold" : "text-[13px]"}`} style={{ color: big ? "#1A1A2E" : "#4a4a5c" }}>{what}</span>
        {sub && <span className="block text-[11px]" style={{ color: "#8a8a99" }}>{sub}</span>}
      </span>
      {action}
    </div>
  );
  const choice = (field: string, options: number[], current: number) => readOnly ? null : (
    <span className="flex gap-1 flex-shrink-0">
      {options.map((o) => (
        <button key={o} type="button" onClick={() => onSave(field, o)} aria-pressed={o === current} aria-label={`${minsLabel(o)}`}
          className="px-1.5 py-0.5 rounded-md text-[11.5px]"
          style={o === current ? { background: BLUE, color: "#fff" } : { color: BLUE, boxShadow: `inset 0 0 0 1px ${BLUE}55` }}>
          {minsLabel(o)}
        </button>
      ))}
    </span>
  );
  return (
    <div data-testid={`home-${plan.role}`} className="mt-2.5 rounded-xl px-3 py-2.5" style={{ background: "#F3F6F9" }}>
      <p className="text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: BLUE }}>{plan.role === "leaving" ? "Getting to the airport" : clockCity ? `Getting home · ${clockCity} time` : "Getting home"}</p>
      {plan.role === "leaving" ? (
        <>
          <Row big when={t(plan.leave)} what="Leave home" sub={plan.leave ? undefined : "Working out the drive…"} />
          {plan.drive != null && <Row when={minsLabel(plan.drive)} what={`Drive to ${airportName}`} sub="Google's estimate with traffic at that hour" />}
          <Row when={t(plan.atAirport)} what="At the airport" sub={`${minsLabel(plan.early)} before the flight`} action={choice("airport_early_min", [120, 180], plan.early)} />
        </>
      ) : (
        <>
          <Row when={t(plan.land)} what={`Land at ${airportName}`} />
          <Row when={minsLabel(plan.bags)} what="Bags and customs" action={choice("bags_min", [30, 60, 90], plan.bags)} />
          {plan.drive != null && <Row when={minsLabel(plan.drive)} what="Drive home" sub="Google's estimate with traffic at that hour" />}
          <Row big when={plan.home ? `~${t(plan.home)}` : "–"} what="Home" sub={plan.home ? undefined : "Working out the drive…"} />
        </>
      )}
    </div>
  );
}

/**
 * Work out and return the home drive for a flight (19 Nov 2026): traffic at the hour you'd
 * drive, half an hour before reaching the airport, or after bags coming home. Used by the
 * card and by the week, so nobody has to open a card for its drive to appear.
 */
export async function measureHomeDrive(
  card: { details: unknown; start_time: string | null; end_time: string | null; place?: { lat?: number | null; lng?: number | null; title?: string | null; address?: string | null; sub_type?: string | null } | null },
  home: Home, dayDate: string | null,
): Promise<{ from: string; mins: number; traffic: true } | null> {
  const role = homeRole(card.details, home.airport);
  const code = homeCode(home.airport);
  if (!role || !code) return null;
  const view = flightPass(card, dayDate);
  const p0 = homePlan(role, card.details, view.departs, view.arrives, null);
  if (!p0) return null;
  const toM = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const start = p0.role === "leaving" ? toM(p0.atAirport) - 30 : toM(p0.land) + p0.bags;
  const hour = Math.floor((((start % 1440) + 1440) % 1440) / 60);
  const apt = await airportPoint(code, card.place);
  if (!apt) return null;
  const here = { lat: home.lat, lng: home.lng };
  const mins = await driveMinutes(role === "leaving" ? here : apt, role === "leaving" ? apt : here, role === "leaving" ? view.departDate : view.arriveDate, hour);
  return mins != null ? { from: home.key, mins, traffic: true } : null;
}
