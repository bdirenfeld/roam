import { describe, it, expect } from "vitest";
import journeys from "./fixtures/journeys.json";
import { checklistRows, type CheckInput, type RowKey } from "./checklist";
import { runSteps, searchLabel, searchSteps, whereToStayHref } from "./search";

// Real journeys from the live database (6 Oct 2026).
type J = CheckInput & { title: string };
const get = (title: string, over: Partial<CheckInput> = {}): CheckInput => {
  const j = (journeys as unknown as J[]).find((x) => x.title === title)!;
  return { ...j, cards: j.cards ?? [], days: j.days ?? [], birthdates: j.birthdates ?? [], ...over };
};
const all = () => true;

describe("Search all: the steps", () => {
  // Australia: flights on the days, Stays and Car open.
  const aus = checklistRows(get("Australia", { airports: ["SYD"] }));
  // Tuscany without the villa: all three open.
  const t = get("Tuscany", { airports: ["PSA", "FLR"] });
  const tus = checklistRows({ ...t, cards: t.cards.filter((c) => c.place?.title !== "Villa Zambaldi") });

  it("Kayak tabs first, Roam's Where to stay last, booked rows never", () => {
    const steps = searchSteps(tus, all, true);
    expect(steps.map((s) => s.key)).toEqual(["flights", "car", "stays"]);
    expect(steps[0].url).toMatch(/^https:\/\/www\.kayak\.com\/flights\/YYZ-PSA,FLR\//);
    expect(steps[2].url).toBeNull();
    expect(searchSteps(aus, all, true).map((s) => s.key)).toEqual(["car", "stays"]);
  });
  it("an unticked row stays out", () => {
    const skipCar = (k: RowKey) => k !== "car";
    expect(searchSteps(tus, skipCar, true).map((s) => s.key)).toEqual(["flights", "stays"]);
  });
  it("a cruise has no Where to stay: Stays keeps its Kayak link, in row order", () => {
    const steps = searchSteps(tus, all, false);
    expect(steps.map((s) => s.key)).toEqual(["flights", "stays", "car"]);
    expect(steps[1].url).toMatch(/kayak\.com\/hotels\//);
  });
  it("the button names what it opens", () => {
    expect(searchLabel(searchSteps(tus, all, true))).toBe("Search flights, car & stays");
    expect(searchLabel(searchSteps(aus, all, true))).toBe("Search car & stays");
    expect(searchLabel(searchSteps(tus, (k) => k === "flights", true))).toBe("Search flights");
  });
});

describe("Search all: one click", () => {
  const t = get("Tuscany", { airports: ["PSA", "FLR"] });
  const steps = searchSteps(checklistRows({ ...t, cards: t.cards.filter((c) => c.place?.title !== "Villa Zambaldi") }), all, true);

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
