import { describe, it, expect } from "vitest";
import { travelSteps } from "./travelSteps";

// His Florence day, 28 Aug 2027: drive to Lucca station, then the train to Florence.
const leg = (id: string, start: string, end: string, mode: string | null, to: string, from = "Villa Zambaldi") => ({
  id, start_time: start, end_time: end,
  details: { ...(mode ? { mode } : {}), from: { title: from, lat: 43.85, lng: 10.5 } },
  place: { title: to, type: "logistics", sub_type: "transit" },
});

describe("one travel card lists the steps (28 Nov 2026, mock approved)", () => {
  it("Leave for Florence: drive, the time to change, the train, arrive", () => {
    const steps = travelSteps([
      leg("drive", "08:00:00", "08:10:00", "drive", "Lucca station"),
      leg("train", "08:25:00", "09:25:00", "train", "Firenze Santa Maria Novella", "Lucca station"),
    ], "Florence", 9 * 60 + 25);
    expect(steps.map((s) => s.kind)).toEqual(["leg", "change", "leg", "arrive"]);
    expect(steps[0]).toMatchObject({ time: "08:00:00", title: "Drive to Lucca", sub: "10 min · from Villa Zambaldi" });
    expect(steps[1]).toEqual({ kind: "change", mins: 15 });
    expect(steps[2]).toMatchObject({ title: "Train to Firenze Santa Maria Novella", sub: "1 h" });
    expect(steps[3]).toEqual({ kind: "arrive", time: "09:25:00", title: "Arrive Florence" });
  });
  it("legs back to back have no change step; a leg with no mode does not guess one", () => {
    const steps = travelSteps([
      leg("a", "15:00:00", "16:00:00", null, "Lucca station", "Florence"),
      leg("b", "16:00:00", "16:40:00", "drive", "Villa Zambaldi", "Lucca station"),
    ], "Villa", null);
    expect(steps.map((s) => s.kind)).toEqual(["leg", "leg", "arrive"]);
    expect(steps[0]).toMatchObject({ title: "To Lucca", sub: "1 h · from Florence" });
    expect(steps[2]).toEqual({ kind: "arrive", time: null, title: "Arrive Villa" });
  });
});
