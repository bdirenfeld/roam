import { describe, it, expect } from "vitest";
import { shortStay, stripDest, stripDuration, joinLegs } from "./travelStrip";

// Titles as the Tuscany board holds them (12 Nov 2026).
const STAYS = ["Villa Zambaldi"];

describe("stripDest", () => {
  it.each([
    ["Villa Zambaldi → Lucca (station car park)", "Lucca"],
    ["Lucca → Florence (Santa Maria Novella)", "Florence"],
    ["Villa Zambaldi → My Tuscan Kitchen (Montefoscoli)", "My Tuscan Kitchen"],
    ["Florence (Santa Maria Novella) → Lucca station", "Lucca"],
    ["Lucca station → Villa Zambaldi", "Villa"],
    ["Montepulciano → Villa Zambaldi", "Villa"],
    ["Villa Zambaldi → Montepulciano (P7)", "Montepulciano"],
    ["Levanto", "Levanto"],
  ])("%s → %s", (title, want) => {
    expect(stripDest(title, STAYS)).toBe(want);
  });

  it("a stay with no house-word keeps its name", () => {
    expect(stripDest("Duomo → Hotel Artemide", ["Hotel Artemide"])).toBe("Hotel Artemide");
  });
});

describe("shortStay", () => {
  it("first word only when it says what the place is", () => {
    expect(shortStay("Villa Zambaldi")).toBe("Villa");
    expect(shortStay("Casa Rosa")).toBe("Casa");
    expect(shortStay("11 Howard")).toBe("11 Howard");
  });
});

describe("stripDuration", () => {
  it.each([[30, "30 min"], [60, "1 h"], [100, "1 h 40"], [130, "2 h 10"]])("%i → %s", (m, s) => {
    expect(stripDuration(m)).toBe(s);
  });
});

describe("joinLegs", () => {
  const h = (hh: number, mm = 0) => hh * 60 + mm;
  it("Sat 28: drive to the station then the train is one run; the way home is another", () => {
    const runs = joinLegs([
      { id: "train-home", startMin: h(15), endMin: h(16, 20) },
      { id: "drive", startMin: h(8), endMin: h(8, 25) },
      { id: "drive-home", startMin: h(16, 25), endMin: h(16, 55) },
      { id: "train", startMin: h(8, 25), endMin: h(9, 45) },
    ]);
    expect(runs).toEqual([
      { lead: "drive", ids: ["drive", "train"], startMin: h(8), endMin: h(9, 45) },
      { lead: "train-home", ids: ["train-home", "drive-home"], startMin: h(15), endMin: h(16, 55) },
    ]);
  });

  it("legs with a real stop between them stay apart", () => {
    const runs = joinLegs([
      { id: "a", startMin: h(9, 40), endMin: h(10, 40) },
      { id: "b", startMin: h(13, 30), endMin: h(14, 30) },
    ]);
    expect(runs.map((r) => r.ids)).toEqual([["a"], ["b"]]);
  });

  it("a gap of exactly 15 min joins; 16 does not; an open-ended leg never takes a follower", () => {
    expect(joinLegs([{ id: "a", startMin: 0, endMin: 30 }, { id: "b", startMin: 45, endMin: 60 }])).toHaveLength(1);
    expect(joinLegs([{ id: "a", startMin: 0, endMin: 30 }, { id: "b", startMin: 46, endMin: 60 }])).toHaveLength(2);
    expect(joinLegs([{ id: "a", startMin: 0, endMin: null }, { id: "b", startMin: 30, endMin: 60 }])).toHaveLength(2);
  });
});

describe("the week board uses it", () => {
  it("WeekBoard draws legs as strips and joins back-to-back legs", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("src/components/plan/WeekBoard.tsx", "utf8");
    expect(src).toContain("data-travel-strip");
    expect(src).toContain("joinLegs(");
    expect(src).toContain("data-leg-menu");
  });
});
