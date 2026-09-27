import { describe, it, expect } from "vitest";
import { tripCountries } from "./countries";

describe("tripCountries", () => {
  it("a summer across four countries is four countries, in the order visited", () => {
    expect(tripCountries("Europe", [
      "Great Russell St, London WC1B 3DG, UK",
      "Champ de Mars, 5 Av. Anatole France, 75007 Paris, France",
      "Piazza del Duomo, 50122 Firenze FI, Italy",
      "Carrer de Mallorca, 401, 08013 Barcelona, Spain",
      "Rue de Rivoli, 75001 Paris, France",
    ])).toEqual(["United Kingdom", "France", "Italy", "Spain"]);
  });
  it("a region with nothing on it yet has no country to check", () => {
    expect(tripCountries("Europe", [])).toEqual([]);
  });
  it("a city destination counts, and its places add any other country", () => {
    expect(tripCountries("Barcelona, Spain", [null, "Moll Adossat, Barcelona, Spain", "Piazza Vittorio Emanuele, 00053 Civitavecchia RM, Italy"])).toEqual(["Spain", "Italy"]);
    expect(tripCountries("Japan", [])).toEqual(["Japan"]);
  });
});
