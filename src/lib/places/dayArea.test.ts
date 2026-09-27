import { describe, it, expect } from "vitest";
import { townOf, dayArea, type AreaPlace } from "./dayArea";

// Addresses exactly as stored on places in the live database (27 Sep 2026).
describe("townOf", () => {
  it("takes the town from the part with the postcode", () => {
    expect(townOf("Via del Pantheon, 51, 00186 Roma RM, Italy")).toBe("Roma");
    expect(townOf("Carrer de Mallorca, 401, L'Eixample, 08013 Barcelona, Spain")).toBe("Barcelona");
    expect(townOf("Observatory Hill, Millers Point NSW 2000, Australia")).toBe("Millers Point");
    expect(townOf("572-27 Gionmachi Minamigawa, Higashiyama Ward, Kyoto, 605-0074, Japan")).toBe("Kyoto");
  });
  it("in North America the town sits before the state or province", () => {
    expect(townOf("6301 Silver Dart Dr, Mississauga, ON L5P 1B2, Canada")).toBe("Mississauga");
    expect(townOf("501 Broadway, Nashville, TN 37203, USA")).toBe("Nashville");
  });
  it("falls back to the part before the country when there is no postcode", () => {
    expect(townOf("Playa Avellana, Guanacaste Province, Santa Cruz, Costa Rica")).toBe("Santa Cruz");
    expect(townOf("Italy")).toBeNull();
    expect(townOf(null)).toBeNull();
  });
});

const at = (address: string, lat: number, lng: number, sub_type: string | null = "self_directed"): AreaPlace => ({ address, lat, lng, sub_type });
const BARCELONA = { label: "Barcelona, Spain", lat: 41.39, lng: 2.17 };

describe("dayArea", () => {
  it("a cruise day in Rome searches Rome, not the port and not Barcelona", () => {
    const area = dayArea([
      at("Piazza Vittorio Emanuele, 00053 Civitavecchia RM, Italy", 42.09, 11.79, "transit"),
      at("Piazza del Colosseo, 1, 00184 Roma RM, Italy", 41.89, 12.49),
    ], BARCELONA);
    expect(area).toEqual({ label: "Roma", lat: 41.89, lng: 12.49 });
  });
  it("an empty day or a sea day keeps the journey's destination", () => {
    expect(dayArea([], BARCELONA)).toEqual(BARCELONA);
    expect(dayArea([{ address: null, lat: null, lng: null, sub_type: null }], BARCELONA)).toEqual(BARCELONA);
  });
  it("a day with only an airport still searches near it", () => {
    expect(dayArea([at("08820 El Prat de Llobregat, Barcelona, Spain", 41.29, 2.08, "flight_arrival")], BARCELONA).lat).toBe(41.29);
  });
});
