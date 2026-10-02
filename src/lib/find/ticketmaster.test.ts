import { describe, it, expect } from "vitest";
import { ticketmasterUrl, parseTicketmaster } from "./ticketmaster";

// Shaped as Discovery API v2 answers (developer.ticketmaster.com, events search).
const event = (id: string, name: string, date: string, extra: Record<string, unknown> = {}) => ({
  id, name, url: `https://www.ticketmaster.com/event/${id}`,
  dates: { start: { localDate: date, localTime: "20:00:00" } },
  classifications: [{ segment: { name: "Music" }, genre: { name: "Rock" } }],
  images: [{ url: "https://s1.ticketm.net/big.jpg", width: 1024, ratio: "16_9" }, { url: "https://s1.ticketm.net/small.jpg", width: 205, ratio: "16_9" }],
  _embedded: { venues: [{ name: "Acrisure Arena", city: { name: "Palm Desert" }, address: { line1: "75-702 Ritz Cove Dr" }, location: { latitude: "33.80", longitude: "-116.38" } }] },
  ...extra,
});

describe("Ticketmaster's shows as Find results", () => {
  it("asks for the trip's dates within a day trip of the base", () => {
    const u = new URL(ticketmasterUrl("KEY", { lat: 33.8303, lng: -116.5453 }, "2027-03-13", "2027-03-20"));
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ latlong: "33.8303,-116.5453", radius: "80", unit: "km", startDateTime: "2027-03-13T00:00:00Z", endDateTime: "2027-03-20T23:59:59Z" });
  });

  it("a show is its own name at its venue, dated, linking to buy, with the small picture", () => {
    const [r] = parseTicketmaster({ _embedded: { events: [event("e1", "Foo Fighters", "2027-03-14")] } });
    expect(r).toMatchObject({
      placeId: "tm:e1", title: "Foo Fighters", name: "Acrisure Arena", address: "75-702 Ritz Cove Dr, Palm Desert",
      lat: 33.8, lng: -116.38, why: "Sun 14 Mar: Rock, 8:00 PM.", source: { name: "Ticketmaster", url: "https://www.ticketmaster.com/event/e1" },
      photo: "https://s1.ticketm.net/small.jpg", kids: false,
    });
  });

  it("a run of nights is one show; a family show suits children; no venue, no result", () => {
    const rs = parseTicketmaster({ _embedded: { events: [
      event("a", "Disney On Ice", "2027-03-14", { classifications: [{ segment: { name: "Family" }, genre: { name: "Undefined" } }] }),
      event("b", "Disney On Ice", "2027-03-15"),
      event("c", "No Venue", "2027-03-16", { _embedded: { venues: [] } }),
    ] } });
    expect(rs.map((r) => r.title)).toEqual(["Disney On Ice"]);
    expect(rs[0]).toMatchObject({ kids: true, why: "Sun 14 Mar: Family, 8:00 PM." });
  });

  it("nothing on is an empty list, not an error", () => {
    expect(parseTicketmaster({ page: { totalElements: 0 } })).toEqual([]);
    expect(parseTicketmaster(null)).toEqual([]);
  });
});
