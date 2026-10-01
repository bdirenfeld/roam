import type { ParsedConfirmation } from "./toCards";

/**
 * The one reader for a booking confirmation (1 Oct 2026). Bookings' upload
 * and a card's attachment used two prompts with different field names, so
 * "Apply to card" on a flight filled almost nothing (no flight number), and an
 * Expedia flight-plus-hotel package came back as one jumbled object with the
 * hotel's address on the flight. Both now read with this one.
 */
export const CONFIRMATION_PROMPT = `You are a travel confirmation parser. Extract structured data from travel confirmations.

Always return a JSON array with ONE object per booking in the document: each flight leg, each hotel stay, each rental car, each reservation. A round-trip flight is two objects (outbound then return); a package with a round-trip flight, a hotel and a car is four.

Each object must have exactly these fields (no extra keys):
{
  "type": "flight_arrival" | "flight_departure" | "hotel" | "car_rental" | "restaurant" | "activity",
  "title": "string — e.g. 'Air Canada · YYZ → FCO' for flights, 'Hertz · Pisa Airport' for cars, hotel/restaurant name for others",
  "confirmation_number": "string or null — booking reference shared by both flights if round-trip",
  "date": "YYYY-MM-DD or null — departure date for flights, check-in date for hotels, pick-up date for cars, reservation date for others",
  "time": "HH:MM or null — departure time for flights, check-in time for hotels, pick-up time for cars, reservation time for others",
  "end_time": "HH:MM or null — arrival time for flights",
  "address": "string or null — for flight_arrival the airport you LAND at, for flight_departure the airport you LEAVE from (name + city); the pick-up location for cars; full address for others",
  "phone": "string or null",
  "website": "string or null — airline website or booking URL",
  "notes": "string or null — duration, passenger names, cabin class, anything else worth keeping",
  "airline": "string or null — flights only, e.g. 'Air Canada'",
  "flight_number": "string or null — flights only, e.g. 'AC890'",
  "origin_airport": "string or null — flights only, where it departs, e.g. 'Toronto Pearson (YYZ)'",
  "arriving_at": "string or null — flights only, where it lands, e.g. 'Rome Fiumicino (FCO)'",
  "seat": "string or null — flights only",
  "check_out_date": "YYYY-MM-DD or null — hotels only, the day you check out",
  "check_out_time": "HH:MM or null — hotels only, the check-out time",
  "drop_off_date": "YYYY-MM-DD or null — cars only, the day you return it",
  "drop_off_time": "HH:MM or null — cars only, the return time",
  "drop_off_location": "string or null — cars only, where you return it, when not the pick-up location"
}

Flight rules:
- The leg ARRIVING at the trip's destination is "flight_arrival"
- The leg DEPARTING from the destination (home, or onward) is "flight_departure"
- Legs of one booking share the same confirmation_number

Return ONLY the JSON array. No markdown, no code fences, no explanation.`;

/** The bookings in Claude's answer, as an array, whatever wrapping it came in. */
export function extractBookings(text: string): ParsedConfirmation[] {
  const t = text.trim();
  const tries: (() => unknown)[] = [
    () => JSON.parse(t),
    () => { const m = t.match(/```(?:json)?\s*([\s\S]*?)```/); if (!m) throw 0; return JSON.parse(m[1].trim()); },
    () => { const m = t.match(/\[[\s\S]*\]/); if (!m) throw 0; return JSON.parse(m[0]); },
    () => { const m = t.match(/\{[\s\S]*\}/); if (!m) throw 0; return [JSON.parse(m[0])]; },
  ];
  for (const go of tries) {
    try {
      const v = go();
      const arr = Array.isArray(v) ? v : [v];
      return arr.filter((x): x is ParsedConfirmation => !!x && typeof x === "object" && typeof (x as { type?: unknown }).type === "string");
    } catch { /* next */ }
  }
  throw new Error("No valid JSON in response");
}
