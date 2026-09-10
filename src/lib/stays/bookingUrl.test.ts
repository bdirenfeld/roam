import { describe, it, expect } from "vitest";
import { bookingUrl, canPrefill, priceSearchUrl, noPriceReason, shiftToYear, type StayDates } from "./bookingUrl";

// Tuscany's real party and dates: two adults, three children, 15 nights.
const D: StayDates = { checkIn: "2027-08-14", checkOut: "2027-08-29", adults: 2, childrenAges: [10, 8, 5] };

describe("bookingUrl", () => {
  it("fills Airbnb in", () => {
    const u = new URL(bookingUrl("https://www.airbnb.ca/rooms/12345", D)!);
    expect(u.searchParams.get("check_in")).toBe("2027-08-14");
    expect(u.searchParams.get("check_out")).toBe("2027-08-29");
    expect(u.searchParams.get("adults")).toBe("2");
    expect(u.searchParams.get("children")).toBe("3");
  });

  it("fills Vrbo in, where children count as heads not a separate field", () => {
    const u = new URL(bookingUrl("https://www.vrbo.com/1234567", D)!);
    expect(u.searchParams.get("startDate")).toBe("2027-08-14");
    expect(u.searchParams.get("endDate")).toBe("2027-08-29");
    expect(u.searchParams.get("adults")).toBe("5");
  });

  it("repeats Booking.com's age parameter, one per child", () => {
    const u = new URL(bookingUrl("https://www.booking.com/hotel/it/villa.html", D)!);
    expect(u.searchParams.getAll("age")).toEqual(["10", "8", "5"]);
    expect(u.searchParams.get("group_children")).toBe("3");
  });

  it("keeps whatever the link already carried", () => {
    const u = new URL(bookingUrl("https://www.vrbo.com/1234567?unitId=99", D)!);
    expect(u.searchParams.get("unitId")).toBe("99");
    expect(u.searchParams.get("startDate")).toBe("2027-08-14");
  });

  it("overwrites stale dates rather than appending a second set", () => {
    const u = new URL(bookingUrl("https://www.airbnb.ca/rooms/1?check_in=2020-01-01", D)!);
    expect(u.searchParams.getAll("check_in")).toEqual(["2027-08-14"]);
  });

  it("leaves a villa's own website alone — a wrong parameter is worse than none", () => {
    const own = "https://www.villabottino.it/en/";
    expect(bookingUrl(own, D)).toBe(own);
    expect(canPrefill(own)).toBe(false);
    expect(canPrefill("https://www.vrbo.com/1")).toBe(true);
  });

  it("survives a link that is not a URL, and null", () => {
    expect(bookingUrl("not a url", D)).toBe("not a url");
    expect(bookingUrl(null, D)).toBeNull();
    expect(canPrefill(null)).toBe(false);
  });
});

describe("priceSearchUrl", () => {
  // Google Travel accepts checkin/checkout and ignores them; Booking does not.
  it("asks Booking for these dates and this party", () => {
    const u = new URL(priceSearchUrl("Villa Bottino", "Lucca, Italy", D));
    expect(u.hostname).toBe("www.booking.com");
    expect(u.searchParams.get("ss")).toBe("Villa Bottino Lucca, Italy");
    expect(u.searchParams.get("checkin")).toBe("2027-08-14");
    expect(u.searchParams.get("checkout")).toBe("2027-08-29");
    expect(u.searchParams.get("group_adults")).toBe("2");
    expect(u.searchParams.getAll("age")).toEqual(["10", "8", "5"]);
  });

  it("manages without a place", () => {
    expect(new URL(priceSearchUrl("Villa Bottino", null, D)).searchParams.get("ss")).toBe("Villa Bottino");
  });
});

describe("shiftToYear", () => {
  it("moves Japan's link to the year its price came from", () => {
    expect(shiftToYear("2028-04-02", "2028-04-15", 2027)).toEqual({ start: "2027-04-02", end: "2027-04-15" });
  });

  it("keeps a journey that straddles New Year in order", () => {
    const w = shiftToYear("2026-12-28", "2027-01-04", 2027);
    expect(w).toEqual({ start: "2027-12-28", end: "2028-01-04" });
    expect(w.end > w.start).toBe(true);
  });

  it("leaves an unshifted journey alone", () => {
    expect(shiftToYear("2027-08-14", "2027-08-29", null)).toEqual({ start: "2027-08-14", end: "2027-08-29" });
    expect(shiftToYear("2027-08-14", "2027-08-29", 2027).start).toBe("2027-08-14");
  });
});

describe("noPriceReason", () => {
  // It describes OUR search, never the property: "no price on a booking site"
  // sat on La Serena Villas, which plainly is on booking sites.
  it("never claims the property is unlisted", () => {
    const said = [
      noPriceReason({ site: "google", url: null, source: "saved" }),
      noPriceReason({ site: "google", url: "https://maps.google.com/x", source: "google" }),
      noPriceReason({ site: "vrbo", url: "https://www.vrbo.com/1", source: "google" }),
    ];
    for (const s of said) expect(s).not.toMatch(/on a booking site|not listed anywhere/i);
  });

  it("says where it looked when the row came off a listing", () => {
    expect(noPriceReason({ site: "vrbo", url: "https://www.vrbo.com/1", source: "google" })).toBe("No rate for these nights on Vrbo.");
    expect(noPriceReason({ site: "booking", url: "https://www.booking.com/1", source: "google" })).toBe("No rate for these nights on Booking.com.");
  });

  it("stays general when the row came off the map or his own saves", () => {
    expect(noPriceReason({ site: "google", url: null, source: "saved" })).toBe("No rate found for these nights.");
  });
});
