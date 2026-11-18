import { describe, it, expect } from "vitest";
import { sortByLabel, sortOptionLists } from "./sortOptions";

describe("sortByLabel", () => {
  it("orders options A–Z by label, ignoring case", () => {
    const out = sortByLabel([
      { label: "Transit", value: "transit" },
      { label: "Arrival", value: "flight_arrival" },
      { label: "pet care", value: "pet_care" },
      { label: "Grocery", value: "grocery" },
    ]);
    expect(out.map((o) => o.label)).toEqual(["Arrival", "Grocery", "pet care", "Transit"]);
  });

  it("does not reorder the list it was given", () => {
    const input = [{ label: "B" }, { label: "A" }];
    sortByLabel(input);
    expect(input.map((o) => o.label)).toEqual(["B", "A"]);
  });
});

describe("sortOptionLists", () => {
  it("sorts every list and keeps every key", () => {
    const out = sortOptionLists({
      food: [{ label: "Restaurant" }, { label: "Bar" }, { label: "Coffee" }],
      activity: [{ label: "Tour" }, { label: "Beach" }],
      logistics: [],
    });
    expect(out.food.map((o) => o.label)).toEqual(["Bar", "Coffee", "Restaurant"]);
    expect(out.activity.map((o) => o.label)).toEqual(["Beach", "Tour"]);
    expect(out.logistics).toEqual([]);
  });
});
