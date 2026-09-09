import { describe, it, expect } from "vitest";
import { nightlyFrom, siteScale, scoreLabel, siteName } from "./price";

describe("nightlyFrom", () => {
  it("La Magnolia: $10,381 for 11 nights is $944 a night", () => {
    expect(nightlyFrom(10381, 11)).toBe(944);
  });
  it("is null with no total or no nights", () => {
    expect(nightlyFrom(null, 11)).toBeNull();
    expect(nightlyFrom(0, 11)).toBeNull();
    expect(nightlyFrom(10381, 0)).toBeNull();
  });
});

describe("scores carry their scale", () => {
  it("Vrbo and Booking are out of 10; Airbnb and Google out of 5", () => {
    expect(siteScale("vrbo")).toBe(10);
    expect(siteScale("booking")).toBe(10);
    expect(siteScale("airbnb")).toBe(5);
    expect(siteScale("google")).toBe(5);
    expect(siteScale(null)).toBe(5);
  });
  it("labels read '9.2 from 53' and '4.93 from 151'", () => {
    expect(scoreLabel(9.2, 10, 53)).toBe("9.2 from 53");
    expect(scoreLabel(4.93, 5, 151)).toBe("4.93 from 151");
    expect(scoreLabel(5, 5, 54)).toBe("5.0 from 54");
  });
  it("says so when there are no reviews", () => {
    expect(scoreLabel(null, 5, 0)).toBe("no reviews yet");
    expect(scoreLabel(4.8, 5, null)).toBe("no reviews yet");
  });
  it("names the site for the link", () => {
    expect(siteName("vrbo")).toBe("Vrbo");
    expect(siteName("airbnb")).toBe("Airbnb");
    expect(siteName("nowhere")).toBe("Listing");
  });
});
