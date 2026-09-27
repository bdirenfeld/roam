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

import { searchCountries, preferCountries } from "./countries";
describe("searching where the journey goes", () => {
  it("puts the journey's countries first, keeping the rest", () => {
    const preds = [
      { description: "Santuário Basílica Sagrada Família, Rua C 14, Goiânia - GO, Brazil" },
      { description: "Basílica de la Sagrada Família, Carrer de Mallorca, 401, Barcelona, Spain" },
    ];
    const c = searchCountries("Europe", []);
    expect(preferCountries(preds, c).map((p) => p.description.split(", ").pop())).toEqual(["Spain", "Brazil"]);
  });
  it("UK in a result matches United Kingdom on the journey", () => {
    const preds = [{ description: "Ontario Place, Toronto, ON, Canada" }, { description: "The British Museum, Great Russell St, London WC1B 3DG, UK" }];
    expect(preferCountries(preds, searchCountries("London, UK", []))[0].description).toContain("British Museum");
  });
  it("no preference, no change", () => {
    const preds = [{ description: "A, Brazil" }, { description: "B, Spain" }];
    expect(preferCountries(preds, [])).toEqual(preds);
  });
});

import { needsEntryCheck } from "./countries";
describe("needsEntryCheck", () => {
  it("a journey only in Canada has nothing to enter", () => {
    expect(needsEntryCheck(tripCountries("Niagara Falls, ON, Canada", ["6650 Niagara Pkwy, Niagara Falls, ON L2E 6X8, Canada"]))).toBe(false);
  });
  it("one step across a border and it does", () => {
    expect(needsEntryCheck(["Canada", "United States"])).toBe(true);
  });
});
