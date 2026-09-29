import { describe, it, expect } from "vitest";
import fixture from "./fixtures/trips.json";
import type { Card } from "@/types/database";
import { buildDraft, previewDraft, draftDays, pinsToPlan, openFromHours, isDraft } from "./draftRows";

// Japan's saved pins as the app holds them: one saved card per place, 2–15 April 2028.
const DAYNAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
type Row = { t: string; ty: string; st: string | null; la: number | null; ln: number | null; open?: string | null; types?: string[] };
const saved = (fixture.trips.find((t) => t.title === "Japan")!.pins as Row[]).map((p, i) => ({
  id: `c${i}`, trip_id: "t1", day_id: null, status: "interested", position: 0, details: {}, start_time: null, end_time: null,
  place_id: `p${i}`,
  place: { id: `p${i}`, title: p.t, type: p.ty, sub_type: p.st, lat: p.la, lng: p.ln, address: null, details: { types: p.types ?? [] },
    hours: p.open ? { weekday_text: DAYNAMES.map((d, k) => `${d}: ${p.open![k] === "1" ? "9:00 AM – 6:00 PM" : "Closed"}`) } : null },
})) as unknown as Card[];
const days = Array.from({ length: 14 }, (_, i) => ({ id: `d${i + 1}`, day_number: i + 1, date: new Date(Date.UTC(2028, 3, 2 + i)).toISOString().slice(0, 10) }));
const DOW = (dayId: string) => (new Date(days.find((d) => d.id === dayId)!.date + "T00:00:00Z").getUTCDay() + 6) % 7;

describe("Plan my trip, end to end on Japan", () => {
  const preview = previewDraft(saved, days, true);

  it("says the pins don't fit and suggests regions that do", () => {
    expect(preview.free).toBe(14);
    const need = preview.regions.filter((r) => preview.suggested.includes(r.id)).reduce((s, r) => s + r.days, 0) + 0.5 * (preview.suggested.length - 1);
    expect(need).toBeLessThanOrEqual(14);
    expect(preview.regions.reduce((s, r) => s + r.days, 0)).toBeGreaterThan(14);
  });

  it("drafts timed cards on free days, never on a closed day, each place once", () => {
    const { rows, dayIds } = buildDraft("t1", saved, days, { kids: true, regions: preview.suggested });
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.every((r) => r.details.draft && r.ai_generated && r.status === "in_itinerary")).toBe(true);
    expect(new Set(rows.map((r) => r.place_id)).size).toBe(rows.length);
    expect(rows.filter((r) => r.start_time).length).toBeGreaterThan(rows.length * 0.8);
    const ghibli = rows.find((r) => r.place_id === saved.find((c) => c.place!.title === "Ghibli Museum")!.place_id);
    if (ghibli) expect(DOW(ghibli.day_id)).not.toBe(1);
    expect(dayIds.length).toBeGreaterThan(5);
  });

  it("leaves a day with a plan on it alone, and gives a flight day half", () => {
    const planned = [
      { id: "x1", day_id: "d3", status: "in_itinerary", position: 1, details: {}, start_time: "10:00:00", end_time: null, place_id: "q1", place: { title: "Booked tour", type: "activity", sub_type: "guided", lat: 35.68, lng: 139.76 } },
      { id: "x2", day_id: "d1", status: "in_itinerary", position: 1, details: {}, start_time: "14:00:00", end_time: null, place_id: "q2", place: { title: "Haneda", type: "logistics", sub_type: "flight_arrival", lat: 35.55, lng: 139.78 } },
    ] as unknown as Card[];
    const dd = draftDays(days, planned);
    expect(dd[2].free).toBe(0);
    expect(dd[0].free).toBe(0.5);
    const { rows } = buildDraft("t1", [...saved, ...planned], days, { kids: true, regions: preview.suggested });
    expect(rows.some((r) => r.day_id === "d3")).toBe(false);
  });

  it("a place already on a day is not planned again", () => {
    const kiyo = saved.find((c) => c.place!.title === "Kiyomizu-dera")!;
    const onDay = { ...kiyo, id: "k2", status: "in_itinerary", day_id: "d9" } as Card;
    expect(pinsToPlan([...saved, onDay]).some((p) => p.title === "Kiyomizu-dera")).toBe(false);
  });

  it("reads closed days from Google's text, and knows a draft card", () => {
    expect(openFromHours({ weekday_text: DAYNAMES.map((d) => `${d}: ${d === "Tuesday" ? "Closed" : "Open 24 hours"}`) })).toBe("1011111");
    expect(openFromHours(null)).toBeNull();
    expect(isDraft({ details: { draft: true } } as unknown as Card)).toBe(true);
    expect(isDraft({ details: {} } as unknown as Card)).toBe(false);
  });
});

import { hasChildren } from "./draftRows";
describe("hasChildren", () => {
  it("reads ages, then birthdates, then assumes a party of three or more might", () => {
    expect(hasChildren([43, 40, 10, 8, 5], [], 7, "2027-08-24")).toBe(true);
    expect(hasChildren([44, 41], [], 2, "2026-10-09")).toBe(false);
    // New York: Brennan and Mia, as people with birthdates.
    expect(hasChildren(null, ["1984-04-03", "2019-08-07"], 2, "2026-07-23")).toBe(true);
    expect(hasChildren(null, [], 5, "2028-04-02")).toBe(true); // Japan, no ages saved
    expect(hasChildren(null, [], 2, "2026-04-22")).toBe(false); // Rome, the two of them
  });
});

describe("which regions are ticked", () => {
  it("Japan: Tokyo, then Osaka and the places near what is ticked — not an island a flight away", () => {
    const p = previewDraft(saved, days, true);
    const byPlace = (title: string) => p.grouping.groups.find((g) => g.items.some((i) => i.title === title))!.region;
    expect(p.suggested[0]).toBe(byPlace("Ghibli Museum"));
    expect(p.suggested).toContain(byPlace("Universal Studios Japan"));
    expect(p.suggested).not.toContain(byPlace("Yakushima Island"));
  });
});
