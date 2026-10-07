// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import {
  DIRECTIONS_APP_KEY, directionsUrl, googleDirectionsUrl, otherApp, readDirectionsApp, wazeDirectionsUrl, writeDirectionsApp,
} from "./directions";

// Piazza San Michele, Lucca — the mock's place (6 Oct 2026, taps audit).
const piazza = { placeName: "Piazza San Michele", placeId: "ChIJpiazza", lat: 43.8431, lng: 10.5027, address: "Piazza San Michele, 55100 Lucca LU, Italy" };

describe("googleDirectionsUrl", () => {
  it("opens the route, not the place page, with the place id and no forced travel mode", () => {
    const url = googleDirectionsUrl(piazza)!;
    expect(url).toBe("https://www.google.com/maps/dir/?api=1&destination=43.8431,10.5027&destination_place_id=ChIJpiazza");
    expect(url).not.toMatch(/travelmode/);
    expect(url).not.toMatch(/maps\/place/);
  });
  it("uses the address when there are no coordinates", () => {
    expect(googleDirectionsUrl({ ...piazza, lat: null, lng: null, placeId: null }))
      .toBe("https://www.google.com/maps/dir/?api=1&destination=Piazza%20San%20Michele%2C%2055100%20Lucca%20LU%2C%20Italy");
  });
  it("is null with nothing to aim at", () => {
    expect(googleDirectionsUrl({ placeName: "x" })).toBeNull();
  });
});

describe("wazeDirectionsUrl", () => {
  it("is unchanged: coordinates first, then the name", () => {
    expect(wazeDirectionsUrl(piazza)).toBe("https://waze.com/ul?ll=43.8431,10.5027&navigate=yes");
    expect(wazeDirectionsUrl({ ...piazza, lat: null, lng: null })).toBe("https://waze.com/ul?q=Piazza%20San%20Michele&navigate=yes");
  });
  it("directionsUrl and otherApp pick the right one", () => {
    expect(directionsUrl("waze", piazza)).toBe(wazeDirectionsUrl(piazza));
    expect(otherApp("google")).toBe("waze");
    expect(otherApp("waze")).toBe("google");
  });
});

describe("the remembered app", () => {
  beforeEach(() => window.localStorage.clear());
  it("round-trips and ignores junk", () => {
    expect(readDirectionsApp()).toBeNull();
    writeDirectionsApp("waze");
    expect(readDirectionsApp()).toBe("waze");
    window.localStorage.setItem(DIRECTIONS_APP_KEY, "apple");
    expect(readDirectionsApp()).toBeNull();
    writeDirectionsApp(null);
    expect(window.localStorage.getItem(DIRECTIONS_APP_KEY)).toBeNull();
  });
});
