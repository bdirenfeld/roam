import { describe, it, expect } from "vitest";
import { siteOf, cleanUrl, nameFromTitle, parsePastedPrice, placementNote } from "./pasted";

describe("cleanUrl", () => {
  it("keeps the link and drops the tracking", () => {
    expect(cleanUrl("https://www.vrbo.com/pdp/lo/34112224?MDPCID=VRBO-META.HPA.WEB-ORGANIC.VR")).toBe("https://www.vrbo.com/pdp/lo/34112224");
    expect(cleanUrl("look at this https://www.airbnb.ca/rooms/12345?source_impression_id=x&utm_medium=share ok")).toBe("https://www.airbnb.ca/rooms/12345?source_impression_id=x");
  });
  it("is null when there is no link", () => {
    expect(cleanUrl("Villa La Magnolia")).toBeNull();
    expect(cleanUrl("")).toBeNull();
  });
});

describe("siteOf", () => {
  it("names the site from the host", () => {
    expect(siteOf("https://www.vrbo.com/pdp/lo/1")).toBe("vrbo");
    expect(siteOf("https://www.airbnb.ca/rooms/1")).toBe("airbnb");
    expect(siteOf("https://www.booking.com/hotel/it/x.html")).toBe("booking");
    expect(siteOf("https://mimaruhotels.com/ja/hotel/ikebukuro/")).toBe("direct");
  });
});

describe("nameFromTitle", () => {
  // Real titles, 15 Sept 2026.
  it("strips the site and keeps the town as a hint", () => {
    expect(nameFromTitle("Carpinteria Beach Townhouse - Last minute summer discount! - Carpinteria | Vrbo"))
      .toEqual({ name: "Carpinteria Beach Townhouse - Last minute summer discount!", locality: "Carpinteria" });
    expect(nameFromTitle("Villa La Magnolia - Villas for Rent in Lucca, Toscana, Italy - Airbnb"))
      .toEqual({ name: "Villa La Magnolia", locality: null });
  });
  it("a plain title is the name", () => {
    expect(nameFromTitle("Mimaru Tokyo Ikebukuro")).toEqual({ name: "Mimaru Tokyo Ikebukuro", locality: null });
    expect(nameFromTitle(null)).toEqual({ name: null, locality: null });
  });
});

describe("placementNote", () => {
  it("says nothing when the place was found exactly", () => {
    expect(placementNote("exact", "Carpinteria")).toBeNull();
  });
  it("names the town or the base when it had to guess", () => {
    expect(placementNote("town", "Carpinteria")).toBe("Placed at Carpinteria, not the exact address");
    expect(placementNote("centre", "Montecito")).toMatch(/centre of Montecito/);
  });
});

describe("parsePastedPrice", () => {
  it("a bare number is the total for the stay", () => {
    expect(parsePastedPrice("$10,400", 11)).toEqual({ total: 10400, nightly: 945 });
  });
  it("'a night' makes it nightly", () => {
    expect(parsePastedPrice("640 a night", 8)).toEqual({ total: 5120, nightly: 640 });
  });
  it("nothing usable is no price", () => {
    expect(parsePastedPrice("", 8)).toEqual({ total: null, nightly: null });
    expect(parsePastedPrice("call for rates", 8)).toEqual({ total: null, nightly: null });
  });
});
