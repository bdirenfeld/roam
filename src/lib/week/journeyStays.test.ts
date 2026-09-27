import { describe, it, expect } from "vitest";
import { journeyStays, shortHotel } from "./journeyStays";

// Hotel cards copied out of the live database on 27 Sep 2026 (every journey
// not archived): day number, place title, place address.
type H = [number, string, string];
const JOURNEYS: Record<string, { n: number; hotels: H[] }> = {
  europe: { n: 62, hotels: [
    [1, "Presidential Apartments, Kensington", "Kensington Apartments, 6-12 Barkston Gardens, London SW5 0EN, UK"],
    [10, "Citadines Saint-Germain-des-Prés Paris (Apart hotel Paris)", "53 ter Quai des Grands Augustins, 75006 Paris, France"],
    [20, "Hotel Ilaria - Lucca", "Via del Fosso, 26, 55100 Lucca LU, Italy"],
    [41, "Lugaris Rambla - Barcelona Beach Apartments", "Rambla del Poblenou, 16-20, Sant Martí, 08005 Barcelona, Spain"],
  ] },
  japan: { n: 12, hotels: [
    [1, "Park Hyatt Tokyo", "2, 3-chōme-7-1 Nishishinjuku, Shinjuku City, Tokyo 163-1055, Japan"],
    [6, "The Thousand Kyoto", "570 Higashishiokōjichō, Shimogyo Ward, Kyoto, 600-8216, Japan"],
    [10, "Cross Hotel Osaka", "2-chōme-5-15 Shinsaibashisuji, Chuo Ward, Osaka, 542-0085, Japan"],
    [12, "Cross Hotel Osaka", "2-chōme-5-15 Shinsaibashisuji, Chuo Ward, Osaka, 542-0085, Japan"],
  ] },
  rome: { n: 7, hotels: [
    [1, "Hotel NH Collection Roma Palazzo Cinquecento", "Piazza dei Cinquecento, 90, 00185 Roma RM, Italy"],
    [3, "Banco 19 B&B", "Via dei Banchi Nuovi, 19, 00186 Roma RM, Italy"],
  ] },
  costaRica: { n: 9, hotels: [
    [1, "Modern Casita", "Playa Langosta, Tamarindo, Guanacaste, Costa Rica"],
    [9, "Modern Casita", "Playa Langosta, Tamarindo, Guanacaste, Costa Rica"],
  ] },
  tuscany: { n: 12, hotels: [
    [1, "Villa Zambaldi", "Via Fonda, 403, 55100 Lucca LU, Italy"],
    [12, "Villa Zambaldi", "Via Fonda, 403, 55100 Lucca LU, Italy"],
  ] },
  newYork: { n: 4, hotels: [[1, "11 Howard", "11 Howard St, New York, NY 10013, USA"]] },
  italy2027: { n: 16, hotels: [] },
};

function stays(key: string) {
  const j = JOURNEYS[key];
  const days = Array.from({ length: j.n }, (_, i) => ({ id: `d${i + 1}`, dayNumber: i + 1 }));
  const hotels = j.hotels.map(([n, name, address]) => ({ dayId: `d${n}`, name, address }));
  return journeyStays(days, hotels);
}
const summary = (key: string) => stays(key)?.map((s) => `${s.label} ${s.dayIds.length}`);

describe("journeyStays", () => {
  it("the Europe summer is four towns, and every one of its 62 days is in one", () => {
    expect(summary("europe")).toEqual(["London 9", "Paris 10", "Lucca 21", "Barcelona 22"]);
  });

  it("Japan names its towns, not its postcodes, and the check-out keeps Osaka whole", () => {
    expect(summary("japan")).toEqual(["Tokyo 5", "Kyoto 4", "Osaka 3"]);
  });

  it("two hotels in one town are named for their hotels, not 'Roma · Roma'", () => {
    expect(summary("rome")).toEqual(["Hotel NH Collection Roma Palazzo Cinquecento 2", "Banco 19 B&B 5"]);
  });

  it("one hotel, or none, is a plain calendar", () => {
    for (const k of ["costaRica", "tuscany", "newYork", "italy2027"]) expect(stays(k), k).toBeNull();
  });

  it("days before the first check-in belong to the first stay", () => {
    const days = Array.from({ length: 5 }, (_, i) => ({ id: `d${i + 1}`, dayNumber: i + 1 }));
    const s = journeyStays(days, [
      { dayId: "d2", name: "A", address: "1 Rue X, 75006 Paris, France" },
      { dayId: "d4", name: "B", address: "Via Y, 55100 Lucca LU, Italy" },
    ]);
    expect(s?.map((x) => x.dayIds)).toEqual([["d1", "d2", "d3"], ["d4", "d5"]]);
  });

  it("returning to a town is two stays with the same name, not a merged one", () => {
    const days = Array.from({ length: 6 }, (_, i) => ({ id: `d${i + 1}`, dayNumber: i + 1 }));
    const s = journeyStays(days, [
      { dayId: "d1", name: "A", address: "1 High St, London W1, UK" },
      { dayId: "d3", name: "B", address: "1 Rue X, 75006 Paris, France" },
      { dayId: "d5", name: "C", address: "2 Low St, London W1, UK" },
    ]);
    expect(s?.map((x) => x.label)).toEqual(["London", "Paris", "London"]);
  });
});

describe("shortHotel", () => {
  it("drops the town and the bracket the listing adds", () => {
    expect(shortHotel("Hotel Ilaria - Lucca")).toBe("Hotel Ilaria");
    expect(shortHotel("Great Wolf Lodge | Niagara")).toBe("Great Wolf Lodge");
    expect(shortHotel("Citadines Saint-Germain-des-Prés Paris (Apart hotel Paris)")).toBe("Citadines Saint-Germain-des-Prés Paris");
    expect(shortHotel("Banco 19 B&B")).toBe("Banco 19 B&B");
  });
});
