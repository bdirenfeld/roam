import { describe, it, expect } from "vitest";
import fixture from "./fixtures/trips.json";
import type { Card } from "@/types/database";
import { buildDraft, previewDraft, draftDays, pinsToPlan, openFromHours, untouchedPlan, spreadGroups, planRoom, dayWords, hasChildren } from "./draftRows";
import hanoi from "./fixtures/hanoi.json";
import { groupPins, type Pin } from "./dayGroups";

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
    // 14 days: settle in on day 1, the last a half day, two days off: never more than four busy days in a row (lib/plan/pace).
    expect(preview.free).toBe(10.5);
    const need = preview.regions.filter((r) => preview.suggested.includes(r.id)).reduce((s, r) => s + r.days, 0) + 0.5 * (preview.suggested.length - 1);
    expect(need).toBeLessThanOrEqual(10.5);
    expect(preview.regions.reduce((s, r) => s + r.days, 0)).toBeGreaterThan(10.5);
  });

  it("drafts timed cards on free days, never on a closed day, each place once", () => {
    const { rows, dayIds } = buildDraft("t1", saved, days, { kids: true, regions: preview.suggested });
    expect(rows.length).toBeGreaterThan(10);
    // Ordinary scheduled cards, each marked with where Plan my trip put it.
    expect(rows.every((r) => r.details.plan.day === r.day_id && r.details.plan.start === r.start_time && r.ai_generated && r.status === "in_itinerary")).toBe(true);
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
    // Landing at 2 pm: nothing can start before 3:30 (lib/plan/airports), so the day is left free.
    expect(dd[0].free).toBe(0);
    // Landing at 10 am leaves the afternoon: half a day.
    const morning = planned.map((c) => (c.id === "x2" ? { ...c, start_time: "10:00:00" } : c)) as Card[];
    expect(draftDays(days, morning)[0].free).toBe(0.5);
    const { rows } = buildDraft("t1", [...saved, ...planned], days, { kids: true, regions: preview.suggested });
    expect(rows.some((r) => r.day_id === "d3")).toBe(false);
  });

  it("a place already on a day is not planned again", () => {
    const kiyo = saved.find((c) => c.place!.title === "Kiyomizu-dera")!;
    const onDay = { ...kiyo, id: "k2", status: "in_itinerary", day_id: "d9" } as Card;
    expect(pinsToPlan([...saved, onDay]).some((p) => p.title === "Kiyomizu-dera")).toBe(false);
  });

  it("reads closed days from Google's text, and knows a card Plan my trip put and nobody moved", () => {
    expect(openFromHours({ weekday_text: DAYNAMES.map((d) => `${d}: ${d === "Tuesday" ? "Closed" : "Open 24 hours"}`) })).toBe("1011111");
    expect(openFromHours(null)).toBeNull();
    const put = { day_id: "d3", start_time: "10:00:00", details: { plan: { day: "d3", start: "10:00:00" } } };
    expect(untouchedPlan(put)).toBe(true);
    expect(untouchedPlan({ ...put, day_id: "d4" })).toBe(false);          // moved to another day
    expect(untouchedPlan({ ...put, start_time: "14:00:00" })).toBe(false); // re-timed
    expect(untouchedPlan({ day_id: "d3", start_time: null, details: {} })).toBe(false);
  });
});

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
describe("the plan keeps to opening hours and real lengths", () => {
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

describe("a bar on a family trip is a late evening", () => {
  const mk = (id: string, title: string, type: string, sub: string, lat: number, lng: number) => ({
    id, trip_id: "t1", day_id: null, status: "interested", position: 0, details: {}, start_time: null, end_time: null, place_id: "p" + id,
    place: { id: "p" + id, title, type, sub_type: sub, lat, lng, address: null, types: [], hours: null },
  }) as unknown as Card;
  const pair = [mk("s", "A museum", "activity", "self_directed", 35.68, 139.76), mk("b", "A bar", "food", "bar", 35.681, 139.761)];
  const three = days.slice(1, 4); // three middle days, all full
  const barTime = (kids: boolean) => buildDraft("t1", pair, three, { kids }).rows.find((r) => r.place_id === "pb")?.start_time;
  it("with children it starts at nine or later; without, at the usual evening hour", () => {
    expect(barTime(true)! >= "21:00").toBe(true);
    expect(barTime(false)! < "21:00").toBe(true);
  });
});

describe("spreadGroups", () => {
  // Rome test 2 (29 Sep 2026): eight sights saved with Find, seven days
  // (six free). Grouped as full days they made three packed days and left
  // four empty; a person spreads them.
  const sight = (id: string, lat: number, lng: number, types: string[], subType = "self_directed"): Pin =>
    ({ id, title: id, type: "activity", subType, lat, lng, types });
  const TA = ["tourist_attraction", "point_of_interest"];
  const rome: Pin[] = [
    sight("San Clemente", 41.8893, 12.4976, ["church", ...TA]),
    sight("Colosseum", 41.8902, 12.4922, TA),
    sight("Colosseum tour", 41.8930, 12.4893, ["point_of_interest"], "guided"),
    sight("Galleria Borghese", 41.9142, 12.4921, ["museum", ...TA]),
    sight("Santa Costanza", 41.9226, 12.5174, ["church", ...TA]),
    sight("Pantheon", 41.8992, 12.4770, TA),
    sight("Palazzo Sciarra", 41.8998, 12.4813, ["museum", ...TA]),
    sight("Trevi Fountain", 41.9009, 12.4833, TA, "guided"),
  ];
  it("spreads a light trip over its days instead of packing it", () => {
    const packed = groupPins(rome, { kids: false });
    const spread = spreadGroups(rome, false, 6);
    expect(packed.groups.length).toBeLessThanOrEqual(3);
    expect(spread.groups.length).toBeGreaterThanOrEqual(5);
    expect(spread.daysNeeded).toBeLessThanOrEqual(6);
  });
  it("leaves a full trip as it was", () => {
    expect(spreadGroups(rome, false, 3).groups.length).toBe(groupPins(rome, { kids: false }).groups.length);
  });
});

describe("a journey shorter than any one area", () => {
  // New York test (29 Sep 2026): Find saved 13 places across the city for a
  // four-day trip. The one area needed more days than the trip had, nothing
  // was ticked, and Plan the trip wrote nothing.
  const PARK = ["park", "point_of_interest"], TA = ["tourist_attraction", "point_of_interest"];
  const ny: [string, string, string, number, number, string[]][] = [
    ["Central Park", "activity", "self_directed", 40.783, -73.966, ["park", ...TA]],
    ["Boat House", "activity", "self_directed", 40.775, -73.969, PARK],
    ["Belvedere Castle", "activity", "self_directed", 40.779, -73.969, TA],
    ["High Line", "activity", "self_directed", 40.748, -74.005, ["park", ...TA]],
    ["Pier 86", "activity", "self_directed", 40.765, -73.999, PARK],
    ["Pier 6 Playground", "activity", "self_directed", 40.692, -74.001, ["point_of_interest"]],
    ["Slide Hill", "activity", "self_directed", 40.686, -74.024, ["point_of_interest"]],
    ["Wave Hill", "activity", "self_directed", 40.898, -73.911, ["art_gallery", ...TA]],
    ["Natural History", "activity", "guided", 40.781, -73.974, ["museum", ...TA]],
    ["SUMMIT", "activity", "guided", 40.753, -73.979, ["museum", ...TA]],
    ["Serendipity 3", "food", "restaurant", 40.762, -73.965, ["restaurant"]],
    ["Juliana's", "food", "restaurant", 40.703, -73.993, ["restaurant"]],
    ["Devocion", "food", "coffee", 40.715, -73.962, ["cafe"]],
  ];
  const cards = ny.map(([t, ty, st, la, ln, types], i) => ({
    id: "n" + i, trip_id: "t2", day_id: null, status: "interested", position: 0, details: {}, start_time: null, end_time: null, place_id: "q" + i,
    place: { id: "q" + i, title: t, type: ty, sub_type: st, lat: la, lng: ln, address: null, details: { types }, hours: null },
  })) as unknown as Card[];
  const four = Array.from({ length: 4 }, (_, i) => ({ id: "e" + (i + 1), day_number: i + 1, date: "2026-07-2" + (3 + i) }));
  it("still plans the biggest area as far as the days go", () => {
    const p = previewDraft(cards, four, true);
    expect(p.regions.some((r) => r.days > p.free)).toBe(true);
    expect(p.suggested).toHaveLength(1);
    const { rows } = buildDraft("t2", cards, four, { kids: true, regions: p.suggested });
    expect(rows.length).toBeGreaterThanOrEqual(6);
  });
  it("a tour company goes on the lightest planned day, untimed, never as a stop at its office", () => {
    const tour = { id: "tour", trip_id: "t2", day_id: null, status: "interested", position: 0, details: {}, start_time: null, end_time: null, place_id: "qt",
      place: { id: "qt", title: "Central Park Bike Tours", type: "activity", sub_type: "guided", lat: 40.766, lng: -73.979, address: null, details: { types: ["travel_agency", "point_of_interest"] }, hours: null } } as unknown as Card;
    const all = [...cards, tour];
    const p = previewDraft(all, four, true);
    const { rows } = buildDraft("t2", all, four, { kids: true, regions: p.suggested });
    const row = rows.find((r) => r.place_id === "qt")!;
    expect(row).toBeTruthy();
    expect(row.start_time).toBeNull();
    // The tour picks its day before saved food is added as meals (lib/plan/mealsOnDays), so meals do not count here.
    const food = new Set(all.filter((c) => c.place?.type === "food").map((c) => c.place_id));
    const perDay = (d: string) => rows.filter((r) => r.day_id === d && r.place_id !== "qt" && !food.has(r.place_id)).length;
    const planned = Array.from(new Set(rows.map((r) => r.day_id)));
    expect(perDay(row.day_id)).toBe(Math.min(...planned.map(perDay)));
  });
  it("a museum with no hours on file is not planned for the evening", () => {
    const p = previewDraft(cards, four, true);
    const { rows } = buildDraft("t2", cards, four, { kids: true, regions: p.suggested });
    const museum = rows.find((r) => r.place_id === "q8");
    if (museum?.start_time) expect(museum.start_time < "15:00").toBe(true);
  });
});

describe("the last day ends at the airport", () => {
  it("nothing is planned after leaving for the airport; what does not fit stays saved", () => {
    // Tuscany (30 Sep 2026): Pisa airport saved as a transit stop at 10:00 on the last day.
    const lastDay = days[days.length - 1].id;
    const airport = { id: "ap", day_id: lastDay, status: "in_itinerary", position: 1, details: {}, start_time: "10:00:00", end_time: null, place_id: "pa",
      place: { title: "Pisa International Airport", type: "logistics", sub_type: "transit", lat: 43.687, lng: 10.394 } } as unknown as Card;
    const dd = draftDays(days, [airport]);
    expect(dd[dd.length - 1].free).toBe(0);
    const p = previewDraft([...saved, airport], days, true);
    const { rows } = buildDraft("t1", [...saved, airport], days, { kids: true, regions: p.suggested });
    expect(rows.filter((r) => r.day_id === lastDay)).toEqual([]);
  });
});

// The Hanoi test trip as it sits in the database (2 Oct 2026): four days, an
// earlier Plan my trip already on days 1-3, six places still saved. The last
// day is half free and every group left needs three quarters of a day.
describe("planRoom: one answer for the sheet and the planner", () => {
  const cards = hanoi.cards as unknown as Card[];
  const kids = hasChildren(hanoi.trip.party_ages, [], hanoi.trip.party_size, hanoi.trip.start_date);

  it("Hanoi: half a day free, six saved, nothing fits, and the planner agrees", () => {
    const p = previewDraft(cards, hanoi.days, kids);
    const room = planRoom(hanoi.trip.id, cards, hanoi.days, { kids, regions: p.suggested });
    expect(room.free).toBe(0.5);
    expect(room.saved).toBe(6);
    expect(room.fits).toBe(0);
    expect(buildDraft(hanoi.trip.id, cards, hanoi.days, { kids, regions: p.suggested }).rows).toHaveLength(room.fits);
  });

  it("Hanoi with day 3 taken off: a whole day comes free and the planner fits what it says", () => {
    // Take the two places off day 3: a whole day comes free.
    const freed = cards.filter((c) => !(c.status === "in_itinerary" && c.day_id === hanoi.days[2].id));
    const p = previewDraft(freed, hanoi.days, kids);
    const room = planRoom(hanoi.trip.id, freed, hanoi.days, { kids, regions: p.suggested });
    expect(room.fits).toBeGreaterThan(0);
    expect(room.fits).toBe(buildDraft(hanoi.trip.id, freed, hanoi.days, { kids, regions: p.suggested }).rows.length);
    expect(room.fits).toBeLessThanOrEqual(room.saved);
  });

  it("says days the way a person does, never as a decimal", () => {
    expect(dayWords(0)).toBe("no time");
    expect(dayWords(0.5)).toBe("half a day");
    expect(dayWords(1)).toBe("1 day");
    expect(dayWords(1.5)).toBe("a day and a half");
    expect(dayWords(3)).toBe("3 days");
    expect(dayWords(10.5)).toBe("10 and a half days");
    for (const n of [0, 0.5, 1, 1.5, 2, 2.5, 7, 10.5]) expect(dayWords(n)).not.toMatch(/d.d/);
  });
});
