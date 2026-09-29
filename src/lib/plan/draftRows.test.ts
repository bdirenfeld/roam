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
    hours: p.open ? {
      weekday_text: DAYNAMES.map((d, k) => `${d}: ${p.open![k] === "1" ? "9:00 AM – 6:00 PM" : "Closed"}`),
      // Google's periods are Sunday-first; the fixture's open string is Monday-first.
      periods: [0, 1, 2, 3, 4, 5, 6].filter((g) => p.open![(g + 6) % 7] === "1").map((g) => ({ open: { day: g, time: "0900" }, close: { day: g, time: "1800" } })),
    } : null },
})) as unknown as Card[];
const days = Array.from({ length: 14 }, (_, i) => ({ id: `d${i + 1}`, day_number: i + 1, date: new Date(Date.UTC(2028, 3, 2 + i)).toISOString().slice(0, 10) }));
const DOW = (dayId: string) => (new Date(days.find((d) => d.id === dayId)!.date + "T00:00:00Z").getUTCDay() + 6) % 7;

describe("Plan my trip, end to end on Japan", () => {
  const preview = previewDraft(saved, days, true);

  it("says the pins don't fit and suggests regions that do", () => {
    expect(preview.free).toBe(13); // 14 days, the first and last half days
    const need = preview.regions.filter((r) => preview.suggested.includes(r.id)).reduce((s, r) => s + r.days, 0) + 0.5 * (preview.suggested.length - 1);
    expect(need).toBeLessThanOrEqual(13);
    expect(preview.regions.reduce((s, r) => s + r.days, 0)).toBeGreaterThan(13);
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

import { hoursWindow } from "./retime";
describe("the draft keeps to opening hours and real lengths", () => {
  it("every timed card is inside its place's hours that day, and a theme park is the day", () => {
    const p = previewDraft(saved, days, true);
    const { rows } = buildDraft("t1", saved, days, { kids: true, regions: p.suggested });
    const byPlace = new Map(saved.map((c) => [c.place_id, c]));
    const min = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    for (const r of rows.filter((x) => x.start_time)) {
      const date = days.find((d) => d.id === r.day_id)!.date;
      const w = hoursWindow((byPlace.get(r.place_id)!.place as unknown as { hours: unknown }).hours, date);
      expect(w).not.toBe("closed");
      if (w && w !== "closed") {
        expect(min(r.start_time!)).toBeGreaterThanOrEqual(w.open);
        expect(min(r.end_time!)).toBeLessThanOrEqual(w.close);
      }
    }
    const sea = rows.find((r) => byPlace.get(r.place_id)!.place!.title === "Tokyo DisneySea")!;
    expect(min(sea.end_time!) - min(sea.start_time!)).toBeGreaterThanOrEqual(6 * 60);
  });
});

describe("travel days and the stamp shop", () => {
  it("the first and last days are half days even with no flight saved", () => {
    const dd = draftDays(days, []);
    expect(dd[0].free).toBe(0.5);
    expect(dd[13].free).toBe(0.5);
    expect(dd[5].free).toBe(1);
  });
  it("a place open only at weekends gets Tokyo's weekend, not DisneySea", () => {
    const p = previewDraft(saved, days, true);
    const { rows } = buildDraft("t1", saved, days, { kids: true, regions: p.suggested });
    const stamps = rows.find((r) => saved.find((c) => c.place_id === r.place_id)!.place!.title.startsWith("Shinimonogurui"));
    expect(stamps).toBeTruthy();
    const dow = new Date(days.find((d) => d.id === stamps!.day_id)!.date + "T00:00:00Z").getUTCDay();
    expect([0, 6]).toContain(dow);
  });
});
