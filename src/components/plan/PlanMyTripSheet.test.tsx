// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import fixture from "@/lib/plan/fixtures/trips.json";
import hanoi from "@/lib/plan/fixtures/hanoi.json";
import muskoka from "@/lib/plan/fixtures/muskoka.json";
import type { Card, Day, Trip } from "@/types/database";

/**
 * Plan my trip, rendered on Japan's saved pins (28 Sep 2026): 48 places that
 * need about 21 days for a 14-day journey, so the regions are listed and the
 * ones that fit are ticked. "Plan the trip" writes one insert of ordinary cards.
 */

const inserted: Record<string, unknown>[][] = [];
const deleted: string[][] = [];
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      insert: (rows: Record<string, unknown>[]) => { inserted.push(rows); return Promise.resolve({ error: null }); },
      delete: () => ({ in: (_k: string, ids: string[]) => { deleted.push(ids); return Promise.resolve({ error: null }); } }),
      select: () => ({ eq: () => Promise.resolve({ data: [] }) }),
    }),
  }),
}));
const toasts: { message: string }[] = [];
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: (t: { message: string }) => toasts.push(t) }) }));

import PlanMyTripSheet from "./PlanMyTripSheet";

const DAYNAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
type Row = { t: string; ty: string; st: string | null; la: number | null; ln: number | null; open?: string | null; types?: string[] };
const cards = (fixture.trips.find((t) => t.title === "Japan")!.pins as Row[]).map((p, i) => ({
  id: `c${i}`, trip_id: "t1", day_id: null, status: "interested", position: 0, details: {}, start_time: null, end_time: null, place_id: `p${i}`,
  place: { id: `p${i}`, title: p.t, type: p.ty, sub_type: p.st, lat: p.la, lng: p.ln, address: null, types: p.types ?? [],
    hours: p.open ? { weekday_text: DAYNAMES.map((d, k) => `${d}: ${p.open![k] === "1" ? "9:00 AM – 6:00 PM" : "Closed"}`) } : null },
})) as unknown as Card[];
const days = Array.from({ length: 14 }, (_, i) => ({ id: `d${i + 1}`, trip_id: "t1", day_number: i + 1, date: new Date(Date.UTC(2028, 3, 2 + i)).toISOString().slice(0, 10) })) as unknown as Day[];
// As in the database: five travelling, no ages saved.
const trip = { id: "t1", title: "Japan", destination: "Japan", party_ages: null, party_size: 5, start_date: "2028-04-02" } as unknown as Trip;

afterEach(() => { cleanup(); inserted.length = 0; deleted.length = 0; toasts.length = 0; });

describe("Plan my trip sheet", () => {
  it("lists the regions with the days each needs, and ticks what fits", () => {
    render(<PlanMyTripSheet trip={trip} days={days} cards={cards} onClose={vi.fn()} onDrafted={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Plan my trip" })).toBeTruthy();
    const regions = screen.getAllByRole("button", { pressed: true });
    expect(regions.length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByRole("button", { pressed: false }).length).toBeGreaterThanOrEqual(1);
    // More places than days: a count of places, never a fraction of a day (2 Oct 2026).
    const line = screen.getByText(/saved places ·/).textContent!;
    expect(line).toMatch(/^\d+ saved places · \d+ fit, so \d+ stay saved$/);
    expect(line).not.toMatch(/\d\.\d/);
  });

  it("a trip with every day planned says so on open, with no Plan button (1 Oct 2026)", () => {
    // A planned place on every one of the 14 days, the saved ones still waiting.
    // A day is taken once an activity is on it (lib/plan/draftRows draftDays).
    const onEveryDay = days.map((d, i) => ({ ...cards[i], id: `p${i}`, day_id: d.id, status: "in_itinerary", start_time: "10:00:00", end_time: "17:00:00", place: { ...cards[i].place!, type: "activity" } })) as unknown as Card[];
    // Saved food would now go on those days as meals (lib/plan/mealsOnDays), so only sights are left saved here.
    render(<PlanMyTripSheet trip={trip} days={days} cards={[...onEveryDay, ...cards.slice(14).filter((c) => c.place?.type !== "food")]} onClose={vi.fn()} onDrafted={vi.fn()} />);
    expect(screen.getByTestId("plan-full").textContent).toBe("Every day is planned."); // the how-to line went (6 Oct 2026)
    expect(screen.queryByRole("button", { name: "Plan the trip" })).toBeNull();
  });

  it("a trip with free days but nothing saved says what to do, with no Plan button (1 Oct 2026)", () => {
    // The button now shows on every trip; the Europe test trip had every place on a day but its free days.
    const onTwoDays = days.slice(0, 2).map((d, i) => ({ ...cards[i], id: `p${i}`, day_id: d.id, status: "in_itinerary", start_time: "10:00:00", end_time: "17:00:00", place: { ...cards[i].place!, type: "activity" } })) as unknown as Card[];
    render(<PlanMyTripSheet trip={trip} days={days} cards={onTwoDays} onClose={vi.fn()} onDrafted={vi.fn()} />);
    expect(screen.getByTestId("plan-nothing").textContent).toBe("Nothing saved to plan yet.Save places on the map or with Find, then run Plan my trip.");
    expect(screen.queryByRole("button", { name: "Plan the trip" })).toBeNull();
    expect(screen.queryByTestId("plan-full")).toBeNull();
  });

  it("plans the trip in one insert and hands the cards back", async () => {
    const onDrafted = vi.fn(), onClose = vi.fn();
    const asked: { url: string; body: { tripId: string; cardIds: string[] } }[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string, init: { body: string }) => { asked.push({ url, body: JSON.parse(init.body) }); return { ok: true, json: async () => ({ written: 0, created: [] }) }; }));
    render(<PlanMyTripSheet trip={trip} days={days} cards={cards} onClose={onClose} onDrafted={onDrafted} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Plan the trip" })); });
    expect(inserted).toHaveLength(1);
    // Every new card's Intent and Know before you go, and a travel card for
    // each day trip: one request each, with every new card.
    expect(asked.map((a) => a.url).sort()).toEqual(["/api/plan/getting-there", "/api/plan/notes"]);
    for (const a of asked) expect(a.body.cardIds.sort()).toEqual(inserted[0].map((r) => r.id as string).sort());
    vi.unstubAllGlobals();
    const rows = inserted[0];
    expect(rows.length).toBeGreaterThan(10);
    expect(rows.every((r) => (r.details as { plan?: { day: string } }).plan?.day === r.day_id && r.status === "in_itinerary" && typeof r.id === "string")).toBe(true);
    expect(onDrafted).toHaveBeenCalledTimes(1);
    expect((onDrafted.mock.calls[0][0] as Card[])[0].place).toBeTruthy();
    expect(toasts[0].message).toMatch(/^Planned \d+ places on \d+ days$/);
    expect(onClose).toHaveBeenCalled();
    // A party of five with no ages saved may have children: bars are a late evening, from nine.
    const bars = cards.filter((c) => c.place!.sub_type === "bar").map((c) => c.place_id);
    const barRows = rows.filter((r) => bars.includes(r.place_id as string));
    expect(barRows.length).toBeGreaterThan(0);
    for (const r of barRows) if (r.start_time) expect((r.start_time as string) >= "21:00").toBe(true);
  });

  it("on a computer the week's tray has the one Undo: no toast, and the travel cards go to the tray (2 Oct 2026)", async () => {
    const travelSent: string[][] = [];
    const onTravel = (e: Event) => travelSent.push((e as CustomEvent<string[]>).detail);
    window.addEventListener("roam:plan-travel", onTravel);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => (url === "/api/plan/getting-there" ? { created: ["travel-1"] } : { written: 0 }) })));
    const onClose = vi.fn();
    render(<PlanMyTripSheet trip={trip} days={days} cards={cards} onClose={onClose} onDrafted={vi.fn()} trayUndo />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Plan the trip" })); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    vi.unstubAllGlobals();
    window.removeEventListener("roam:plan-travel", onTravel);
    expect(toasts).toHaveLength(0);
    expect(onClose).toHaveBeenCalled();
    expect(travelSent).toEqual([["travel-1"]]);
  });

  it("unticking a region leaves its places out", async () => {
    render(<PlanMyTripSheet trip={trip} days={days} cards={cards} onClose={vi.fn()} onDrafted={vi.fn()} />);
    const ticked = screen.getAllByRole("button", { pressed: true });
    fireEvent.click(ticked[0]);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Plan the trip" })); });
    const one = inserted[0].length;
    cleanup(); inserted.length = 0;
    render(<PlanMyTripSheet trip={trip} days={days} cards={cards} onClose={vi.fn()} onDrafted={vi.fn()} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Plan the trip" })); });
    expect(inserted[0].length).toBeGreaterThan(one);
  });

  it("removes what Plan my trip added and nobody has moved, and leaves what was moved", async () => {
    const put = { ...cards[0], id: "k1", status: "in_itinerary", day_id: "d3", start_time: "10:00:00", details: { plan: { day: "d3", start: "10:00:00" } } } as Card;
    const moved = { ...cards[1], id: "k2", status: "in_itinerary", day_id: "d5", start_time: "10:00:00", details: { plan: { day: "d4", start: "10:00:00" } } } as Card;
    render(<PlanMyTripSheet trip={trip} days={days} cards={[...cards, put, moved]} onClose={vi.fn()} onDrafted={vi.fn()} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Remove what Plan my trip added (1 place)" })); });
    expect(deleted).toEqual([["k1"]]);
    expect(toasts[0].message).toBe("Removed 1 place Plan my trip added");
  });

  it("when the places need more days than the trip has, it says some stay saved, not 'N of fewer days'", () => {
    // Tokyo alone: one area, many days of places, a two-day journey.
    const tokyo = cards.filter((c) => c.place && Math.abs(c.place.lat! - 35.68) < 0.3 && Math.abs(c.place.lng! - 139.7) < 0.4);
    render(<PlanMyTripSheet trip={trip} days={days.slice(0, 2)} cards={tokyo} onClose={vi.fn()} onDrafted={vi.fn()} />);
    // Places that fit and places that stay saved, counted (2 Oct 2026).
    expect(screen.getByText(/saved places ·/).textContent).toMatch(/^\d+ saved places · \d+ fit, so \d+ stay saved$/);
    expect(screen.getByRole("button", { name: "Plan the trip" })).toBeTruthy();
  });

  it("Hanoi, as in the database: half a day free and nothing fits, so it says so and offers no Plan button (2 Oct 2026)", () => {
    // Brennan: the sheet said "6 saved places · about 3 days of places for 0.5 free"
    // and showed Plan the trip; pressing it said "Nothing to plan". "It shouldn't offer both."
    const t = { ...hanoi.trip, title: "Hanoi", destination: "Hanoi" } as unknown as Trip;
    render(<PlanMyTripSheet trip={t} days={hanoi.days as unknown as Day[]} cards={hanoi.cards as unknown as Card[]} onClose={vi.fn()} onDrafted={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Plan the trip" })).toBeNull();
    const msg = screen.getByTestId("plan-full").textContent!;
    expect(msg).toBe("No room for what\u2019s left.Only half a day is free, and each place left needs more than that. ");
    expect(msg).not.toMatch(/0\.5/);
    // Still the way back: the four places the earlier run put on days.
    expect(screen.getByRole("button", { name: "Remove what Plan my trip added (4 places)" })).toBeTruthy();
  });

  it("Muskoka, every day with a sight: offers the saved food as meals and says why one stays saved (3 Oct 2026)", () => {
    // It said "No room for what's left" for two cafés and a restaurant.
    const t = { ...muskoka.trip, title: "Muskoka" } as unknown as Trip;
    render(<PlanMyTripSheet trip={t} days={muskoka.days as unknown as Day[]} cards={muskoka.cards as unknown as Card[]} onClose={vi.fn()} onDrafted={vi.fn()} />);
    expect(screen.queryByTestId("plan-full")).toBeNull();
    expect(screen.getByRole("button", { name: "Plan the trip" })).toBeTruthy();
    const lines = Array.from(screen.getByTestId("plan-meals").querySelectorAll("li")).map((li) => li.textContent);
    expect(lines).toEqual([
      "Dinner at The Old Station Restaurant, Sat 10 Oct, near Santa's Village: Muskoka's Theme Park.",
      "Coffee at Threshold Café & Collective, Sun 11 Oct, before Treetop Trekking Huntsville.",
      "Henrietta’s Pine Bakery - Huntsville stays saved. It's closed on Sun 11 Oct, the only day near it.",
    ]);
  });

  it("Hanoi with day 3 taken off: the button shows, and pressing it plans what the line said (2 Oct 2026)", async () => {
    const t = { ...hanoi.trip, title: "Hanoi" } as unknown as Trip;
    const freed = (hanoi.cards as unknown as Card[]).filter((c) => !(c.status === "in_itinerary" && c.day_id === hanoi.days[2].id));
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
    render(<PlanMyTripSheet trip={t} days={hanoi.days as unknown as Day[]} cards={freed} onClose={vi.fn()} onDrafted={vi.fn()} />);
    const line = screen.getByText(/saved places ·/).textContent!;
    const m = /· (\d+) fit, so/.exec(line);
    const said = Number(m ? m[1] : /^(\d+) saved/.exec(line)![1]);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Plan the trip" })); });
    vi.unstubAllGlobals();
    expect(inserted).toHaveLength(1);
    expect(inserted[0].length).toBe(said);
    expect(toasts.some((x) => /Nothing to plan/.test(x.message))).toBe(false);
  });

  describe("food that stays saved, as one line (6 Oct 2026, designer audit)", () => {
    // Muskoka as stored, plus four more restaurants beside The Old Station: Sat
    // 10 Oct can take one dinner, so the rest stay saved with the same reason,
    // and Henrietta's stays saved because it is shut on the one day near it.
    const t = { ...muskoka.trip, title: "Muskoka" } as unknown as Trip;
    const base = muskoka.cards as unknown as Card[];
    const station = base.find((c) => c.place?.title === "The Old Station Restaurant")!;
    const copies = [1, 2, 3, 4].map((i) => ({ ...station, id: `x${i}`, place_id: `px${i}`, place: { ...station.place!, id: `px${i}`, title: `Station copy ${i}` } })) as unknown as Card[];
    const mDays = muskoka.days as unknown as Day[];

    it("only food that cannot fit: one line with the reason, names behind See which; Remove stays, quiet", () => {
      const allFull = [...base.filter((c) => !/Henrietta/.test(c.place?.title ?? "")), ...copies];
      render(<PlanMyTripSheet trip={t} days={mDays} cards={allFull} onClose={vi.fn()} onDrafted={vi.fn()} />);
      const line = screen.getByTestId("plan-meals-left");
      expect(line.textContent).toBe("4 food places stay saved: those days already have their meals. See which");
      expect(screen.queryByText(/stays saved\. Sat 10 Oct already has/)).toBeNull();
      expect(screen.queryByTestId("plan-meals-left-names")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "See which" }));
      const names = Array.from(screen.getByTestId("plan-meals-left-names").querySelectorAll("li")).map((li) => li.textContent);
      expect(names).toHaveLength(4);
      expect(names.every((n) => !/already has/.test(n!))).toBe(true);
      // The way back is still there — a quiet grey link now, not sienna.
      const remove = screen.getByRole("button", { name: /^Remove what Plan my trip added \(\d+ places?\)$/ });
      expect(remove.style.color).toBe("rgba(26, 26, 46, 0.55)");
      expect(remove.className).not.toMatch(/B0541F/);
    });

    it("mixed reasons: the line claims no reason, and each name keeps its own", () => {
      render(<PlanMyTripSheet trip={t} days={mDays} cards={[...base, ...copies]} onClose={vi.fn()} onDrafted={vi.fn()} />);
      expect(screen.getByTestId("plan-meals-left").textContent).toBe("5 food places stay saved. See which");
      fireEvent.click(screen.getByRole("button", { name: "See which" }));
      const names = Array.from(screen.getByTestId("plan-meals-left-names").querySelectorAll("li")).map((li) => li.textContent);
      expect(names).toContain("Henrietta’s Pine Bakery - Huntsville — It's closed on Sun 11 Oct, the only day near it.");
    });

    it("See which does not hide Remove, and Remove still takes the plan off with Undo", async () => {
      render(<PlanMyTripSheet trip={t} days={mDays} cards={[...base, ...copies]} onClose={vi.fn()} onDrafted={vi.fn()} />);
      fireEvent.click(screen.getByRole("button", { name: "See which" }));
      const remove = screen.getByRole("button", { name: /^Remove what Plan my trip added/ });
      await act(async () => { fireEvent.click(remove); });
      expect(toasts.some((x) => /^Removed \d+ places? Plan my trip added$/.test(x.message))).toBe(true);
    });
  });
});
