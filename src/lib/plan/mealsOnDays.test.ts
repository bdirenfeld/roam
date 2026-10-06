import { describe, it, expect } from "vitest";
import type { Card } from "@/types/database";
import muskoka from "./fixtures/muskoka.json";
import { previewDraft, planRoom, hasChildren } from "./draftRows";
import { mealsOnPlannedDays, slotOfTime, leftLine, type MealCandidate, type MealLeft, type PlannedDay } from "./mealsOnDays";

// Muskoka, 3 Oct 2026, after his Plan my trip run: Dwight Beach (Fri),
// Santa's Village (Sat) and Treetop Trekking (Sun) on days; two Huntsville
// cafés and a Bracebridge restaurant still saved. The sheet said "No room for
// what's left" for them, because meals only joined NEW days.
describe("Muskoka: saved food goes on days already planned", () => {
  const cards = muskoka.cards as unknown as Card[];
  const kids = hasChildren(muskoka.trip.party_ages, [], muskoka.trip.party_size, muskoka.trip.start_date);
  const p = previewDraft(cards, muskoka.days, kids);
  const room = planRoom(muskoka.trip.id, cards, muskoka.days, { kids, regions: p.suggested });
  const title = (placeId: string) => cards.find((c) => c.place_id === placeId)!.place!.title;
  const dayOf = (id: string) => muskoka.days.find((d) => d.id === id)!.day_number;

  it("plans the Old Station as dinner after Santa's Village and Threshold as coffee before Treetop Trekking", () => {
    const got = room.rows.map((r) => [title(r.place_id), dayOf(r.day_id), r.start_time, r.end_time]);
    expect(got).toContainEqual(["The Old Station Restaurant", 2, "18:00:00", "19:30:00"]);
    expect(got).toContainEqual(["Threshold Café & Collective", 3, "09:00:00", "09:45:00"]);
    expect(room.fits).toBe(2);
  });

  it("says in plain words why Henrietta's stays saved: shut on the one day near it", () => {
    expect(room.meals.left).toEqual([
      expect.objectContaining({ title: "Henrietta’s Pine Bakery - Huntsville", reason: "It's closed on Sun 11 Oct, the only day near it." }),
    ]);
  });

  it("never times a meal over a card already on the day", () => {
    for (const r of room.rows) {
      const on = cards.filter((c) => c.day_id === r.day_id && c.status === "in_itinerary" && c.start_time && c.end_time);
      for (const c of on) expect(r.start_time! >= c.end_time!.slice(0, 5) || r.end_time! <= c.start_time!.slice(0, 5)).toBe(true);
    }
  });
});

describe("mealsOnPlannedDays", () => {
  const open = (w: { open: number; close: number } | "closed" | null) => () => w;
  const cafe = (id: string, lat = 45, extra: Partial<MealCandidate> = {}): MealCandidate => ({ id, title: id, subType: "coffee", lat, lng: -79, windowOn: open(null), ...extra });
  const day = (id: string, extra: Partial<PlannedDay> = {}): PlannedDay => ({ id, date: "2026-10-10", sights: [{ lat: 45.01, lng: -79, title: "Sight" }], busy: [{ start: 600, end: 1020 }], taken: [], ...extra });

  it("one coffee a morning: the closer café gets it, the other is told why", () => {
    const r = mealsOnPlannedDays([cafe("far", 45.05), cafe("near", 45.012)], [day("d")]);
    expect(r.placed).toEqual([expect.objectContaining({ id: "near", slot: "coffee", start: 540, end: 585 })]);
    expect(r.left).toEqual([{ id: "far", title: "far", reason: "Sat 10 Oct already has a coffee, or no time before the day starts.", why: "full" }]);
  });

  it("a restaurant is lunch when the middle of the day is free, dinner when a sight fills it", () => {
    const rest = (id: string) => cafe(id, 45, { subType: "restaurant" });
    expect(mealsOnPlannedDays([rest("a")], [day("d", { busy: [{ start: 600, end: 690 }] })]).placed[0]).toMatchObject({ slot: "lunch", start: 720 });
    expect(mealsOnPlannedDays([rest("a")], [day("d")]).placed[0]).toMatchObject({ slot: "dinner", start: 1080, end: 1170 });
  });

  it("nothing near, or no room in the hours, stays saved with a reason", () => {
    expect(mealsOnPlannedDays([cafe("x", 46)], [day("d")]).left[0].reason).toBe("No planned day goes near it.");
    const late = cafe("y", 45, { windowOn: open({ open: 10 * 60, close: 16 * 60 }) });
    expect(mealsOnPlannedDays([late], [day("d")]).left[0].reason).toMatch(/already has a coffee, or no time/);
  });

  it("food already on a day takes its slot", () => {
    expect(slotOfTime(540, "coffee")).toBe("coffee");
    expect(slotOfTime(1110, "restaurant")).toBe("dinner");
    expect(mealsOnPlannedDays([cafe("a")], [day("d", { taken: ["coffee"] })]).placed).toEqual([]);
  });
});

describe("leftLine (6 Oct 2026): the food that stays saved, as one line", () => {
  const full = (t: string): MealLeft => ({ id: t, title: t, reason: "Sat 28 Aug already has a lunch and a dinner, or no time for them.", why: "full" });
  it("six on a planned Tuscany: one line that gives the reason", () => {
    const six = ["Sottosotto", "Bottega Visconti 1973", "Pippo a Vernazza", "Alberto Gelateria", "Il Casello", "Il Piccolo Diavolo"].map(full);
    expect(leftLine(six)).toEqual({ line: "6 food places stay saved: those days already have their meals.", allFull: true });
  });
  it("claims no reason when one of them is shut or far", () => {
    expect(leftLine([full("a"), { id: "b", title: "b", reason: "No planned day goes near it.", why: "far" }])).toEqual({ line: "2 food places stay saved.", allFull: false });
  });
  it("one place keeps its own sentence", () => {
    expect(leftLine([full("a")])).toBeNull();
    expect(leftLine([])).toBeNull();
  });
});
