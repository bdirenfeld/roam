import { describe, it, expect } from "vitest";
import { classify } from "./pinToJourney";
import { subTypeLabel } from "@/lib/subTypeLabel";

describe("classify (Ideas → a journey's map)", () => {
  it("files a hotel as a hotel, so it can be the stay", () => {
    expect(classify(["lodging", "point_of_interest"])).toEqual({ type: "logistics", sub_type: "hotel" });
  });

  it("uses the app's own food sub-types", () => {
    expect(classify(["cafe"]).sub_type).toBe("coffee");
    expect(classify(["ice_cream_shop", "cafe"]).sub_type).toBe("dessert");
    expect(classify(["bar"]).sub_type).toBe("bar");
    expect(classify(["restaurant", "bar"]).sub_type).toBe("restaurant");
  });

  it("every sub-type it can write has a label", () => {
    const all = [["lodging"], ["cafe"], ["ice_cream_shop"], ["bar"], ["restaurant"], ["spa"], ["museum"]];
    for (const t of all) expect(subTypeLabel(classify(t).sub_type)).toBeTruthy();
  });
});
