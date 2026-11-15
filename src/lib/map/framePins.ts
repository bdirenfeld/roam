// ── Which pins the map frames when it opens ─────────────────────────────────
//
// A flight pin far from every other stop is the home side of the trip (YYZ on
// Tuscany sits 6,758 km from the nearest stop): framing it zoomed the map out
// to the Atlantic (Brennan, 15 Nov 2026). The pin still draws; it just doesn't
// pull the opening frame out. Only flight pins are ever left out, so a trip
// with several far-apart bases (Osaka and Tokyo, a road trip) frames every
// stop. Across every journey on 15 Nov 2026 the kept airports were all within
// 17 km of a stop and the left-out ones 565 km or more away.

import { kmBetween } from "@/lib/travel/leg";

export const FAR_FLIGHT_KM = 300;

export interface FramePin {
  lat: number;
  lng: number;
  /** place.sub_type is flight_arrival or flight_departure. */
  isFlight: boolean;
}

/** The pins to frame: all of them, less any flight pin 300 km or more from every non-flight pin. */
export function framePins<T extends FramePin>(pins: T[]): T[] {
  const stops = pins.filter((p) => !p.isFlight);
  // Nothing but flights (a journey with only its tickets in): frame what there is.
  if (stops.length === 0) return pins;
  return pins.filter((p) => !p.isFlight || stops.some((s) => kmBetween(p, s) < FAR_FLIGHT_KM));
}
