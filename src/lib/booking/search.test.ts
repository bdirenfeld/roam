import { describe, it, expect } from "vitest";
import journeys from "./fixtures/journeys.json";
import { checklistRows, type CheckInput } from "./checklist";
import { bookLabel, runSteps, searchSteps, whereToStayHref } from "./search";

// Real journeys from the live database (6 Oct 2026).
type J = CheckInput & { title: string };
const get = (title: string, over: Partial<CheckInput> = {}): CheckInput => {
  const j = (journeys as unknown as J[]).find((x) => x.title === title)!;
  return { ...j, cards: j.cards ?? [], days: j.days ?? [], birthdates: j.birthdates ?? [], ...over };
};

describe("Search all: the steps", () => {
  // Australia: flights on the days, Stays and Car open.
  const aus = checklistRows(get("Australia", { airports: ["SYD"] }));
  // Tuscany without the villa: all three open.
  const t = get("Tuscany", { airports: ["PSA", "FLR"] });
  const tus = checklistRows({ ...t, cards: t.cards.filter((c) => c.place?.title !== "Villa Zambaldi") });

  it("Kayak tabs first, Roam's Where to stay last, booked rows never", () => {
    const steps = searchSteps(tus, true);
    expect(steps.map((s) => s.key)).toEqual(["flights", "car", "stays"]);
    expect(steps[0].url).toMatch(/^https:\/\/www\.kayak\.com\/flights\/YYZ-PSA,FLR\//);
    expect(steps[2].url).toBeNull();
    expect(searchSteps(aus, true).map((s) => s.key)).toEqual(["car", "stays"]);
  });
  it("a Not needed row stays out (it replaced the old include-in-search boxes)", () => {
    const skipCar = tus.map((r) => (r.key === "car" ? { ...r, state: "skip" as const, url: null } : r));
    expect(searchSteps(skipCar, true).map((s) => s.key)).toEqual(["flights", "stays"]);
  });
  it("a cruise has no Where to stay: Stays keeps its Kayak link, in row order", () => {
    const steps = searchSteps(tus, false);
    expect(steps.map((s) => s.key)).toEqual(["flights", "stays", "car"]);
    expect(steps[1].url).toMatch(/kayak\.com\/hotels\//);
  });
  it("the one button counts what is still to book, and hides when nothing is", () => {
    expect(bookLabel(searchSteps(tus, true))).toBe("Book 3 on Kayak");
    expect(bookLabel(searchSteps(aus, true))).toBe("Book 2 on Kayak");
    expect(bookLabel([])).toBeNull();
  });
});

describe("Search all: one click", () => {
  const t = get("Tuscany", { airports: ["PSA", "FLR"] });
  const steps = searchSteps(checklistRows({ ...t, cards: t.cards.filter((c) => c.place?.title !== "Villa Zambaldi") }), true);

  it("a computer opens every tab, then goes to Where to stay", () => {
    const urls: string[] = [];
    const r = runSteps(steps, (u) => { urls.push(u); return {}; });
    expect(urls).toHaveLength(2);
    expect(r).toEqual({ opened: ["flights", "car"], stay: true, rest: [] });
  });
  it("an iPhone that allows only the first tab keeps the rest as Next buttons, and does not leave yet", () => {
    let n = 0;
    const r = runSteps(steps, () => (n++ === 0 ? {} : null));
    expect(r.opened).toEqual(["flights"]);
    expect(r.stay).toBe(false);
    expect(r.rest.map((s) => s.key)).toEqual(["car", "stays"]);
    // The Next tap is its own click: the car opens, then Where to stay.
    expect(runSteps(r.rest, () => ({}))).toEqual({ opened: ["car"], stay: true, rest: [] });
  });
  it("nothing to open does nothing", () => {
    expect(runSteps([], () => ({}))).toEqual({ opened: [], stay: false, rest: [] });
  });
});

describe("Where to stay, by the journey menu's own path", () => {
  it("the phone's Map screen, or the computer's Plan", () => {
    expect(whereToStayHref("fa33c1cc", false)).toBe("/trips/fa33c1cc/map?stays=1");
    expect(whereToStayHref("fa33c1cc", true)).toBe("/trips/fa33c1cc/plan?stays=1");
  });
});
