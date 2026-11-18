import { describe, it, expect } from "vitest";
import { subTypeLabel } from "./subTypeLabel";

describe("the 18 Nov 2026 kinds", () => {
  it("reads Clinic for medical, Event for the one festival, and names the new kinds", () => {
    expect(subTypeLabel("medical")).toBe("Clinic");
    expect(subTypeLabel("festival")).toBe("Event");
    expect(subTypeLabel("theme_park")).toBe("Theme park");
    expect(subTypeLabel("car_rental")).toBe("Car rental");
  });
});
