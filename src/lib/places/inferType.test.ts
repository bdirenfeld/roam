import { describe, it, expect } from "vitest";
import { inferType, inferTypeOrSight, isPortName, isCruiseName, isBarLike, isCampName } from "./inferType";

// Google `types` exactly as returned for real places (26 Sep 2026 test journeys).
describe("inferType", () => {
  it("reads the specific categories", () => {
    expect(inferType(["restaurant", "food", "point_of_interest", "establishment"])).toEqual({ type: "food", sub_type: "restaurant" });
    expect(inferType(["lodging", "point_of_interest", "establishment"])).toEqual({ type: "logistics", sub_type: "hotel" });
    expect(inferType(["airport", "point_of_interest", "establishment"])).toEqual({ type: "logistics", sub_type: "flight_arrival" });
    expect(inferType(["amusement_park", "establishment", "museum"])).toEqual({ type: "activity", sub_type: "guided" }); // teamLab: museum is ranked first
  });
  it("keeps a gelateria as food, not a shop", () => {
    expect(inferType(["food", "point_of_interest", "store", "establishment"])).toEqual({ type: "food", sub_type: "restaurant" });
  });
  it("finds nothing for streets, neighbourhoods and bare points of interest", () => {
    expect(inferType(["establishment", "point_of_interest"]).type).toBeNull();   // Tsukiji Outer Market
    expect(inferType(["geocode", "route"]).type).toBeNull();                      // Takeshita Street
    expect(inferType(["geocode", "political", "sublocality"]).type).toBeNull();   // Dotonbori
    expect(inferType(null).type).toBeNull();
  });
});

describe("inferTypeOrSight", () => {
  it("falls back to a sight you wander instead of nothing", () => {
    expect(inferTypeOrSight(["establishment", "point_of_interest"])).toEqual({ type: "activity", sub_type: "self_directed" });
    expect(inferTypeOrSight(["colloquial_area", "geocode", "political"])).toEqual({ type: "activity", sub_type: "self_directed" });
    expect(inferTypeOrSight(undefined)).toEqual({ type: "activity", sub_type: "self_directed" });
  });
  it("keeps a real category when there is one", () => {
    expect(inferTypeOrSight(["cafe", "food"])).toEqual({ type: "food", sub_type: "coffee" });
  });
});

// Names and Google types exactly as returned for the ports of a Mediterranean cruise (27 Sep 2026).
describe("ports", () => {
  const TRANSIT = { type: "logistics", sub_type: "transit" };
  it("reads a cruise or ferry port from its name, since Google gives it no category", () => {
    expect(inferTypeOrSight(["establishment", "point_of_interest"], "Cruise Terminal B")).toEqual(TRANSIT);
    expect(inferTypeOrSight(["establishment", "point_of_interest"], "Terminal de creuers C")).toEqual(TRANSIT);
    expect(inferTypeOrSight(["establishment", "point_of_interest", "tourist_attraction"], "civitavecchia cruise port")).toEqual(TRANSIT);
    expect(inferTypeOrSight(["establishment", "point_of_interest", "travel_agency"], "Civitavècchia Port")).toEqual(TRANSIT);
    expect(inferTypeOrSight(["establishment", "natural_feature"], "Stazione Marittima")).toEqual(TRANSIT);
    expect(inferTypeOrSight(["establishment", "point_of_interest"], "Cruise Terminal, Palma de Mallorca, Estacio Maritima 2")).toEqual(TRANSIT);
  });
  it("never turns a museum, a meal or a town into a port", () => {
    expect(inferTypeOrSight(["museum", "establishment"], "Museu Marítim de Barcelona")).toEqual({ type: "activity", sub_type: "guided" });
    expect(inferTypeOrSight(["restaurant", "food"], "Port of Call Grill").type).toBe("food");
    expect(isPortName("Portofino")).toBe(false);
    expect(isPortName("Sports Bar Barcelona")).toBe(false);
    expect(isPortName("Vernazza")).toBe(false);
    expect(inferTypeOrSight(["establishment", "point_of_interest"])).toEqual({ type: "activity", sub_type: "self_directed" });
  });
});

describe("isCruiseName", () => {
  it("reads a cruise from the journey's name", () => {
    expect(isCruiseName("TEST - Mediterranean cruise")).toBe(true);
    expect(isCruiseName("Alaska sailing")).toBe(true);
    expect(isCruiseName("Tuscany")).toBe(false);
    expect(isCruiseName("Cruiseship-free Portugal")).toBe(false);
    expect(isCruiseName("")).toBe(false);
  });
});

// Google types exactly as returned (27 Sep 2026): the Nashville bachelor party.
describe("bars", () => {
  const BAR_RESTAURANT = ["bar", "establishment", "food", "point_of_interest", "restaurant"];
  it("a honky-tonk named as a bar is a bar", () => {
    expect(inferTypeOrSight([...BAR_RESTAURANT, "tourist_attraction"], "Tootsies Orchid Lounge")).toEqual({ type: "food", sub_type: "bar" });
    expect(inferTypeOrSight(BAR_RESTAURANT, "Honky Tonk Central")).toEqual({ type: "food", sub_type: "bar" });
    expect(inferTypeOrSight(["bar", "establishment", "night_club", "point_of_interest"], "The Stage on Broadway")).toEqual({ type: "food", sub_type: "bar" });
  });
  it("a restaurant with a bar stays a restaurant", () => {
    expect(inferTypeOrSight(BAR_RESTAURANT, "Husk Nashville").sub_type).toBe("restaurant");
    expect(inferTypeOrSight(["bar", "establishment", "food", "night_club", "point_of_interest", "restaurant"], "Rolf and Daughters").sub_type).toBe("restaurant");
    expect(isBarLike(["establishment", "food", "restaurant"], "Bar Italia")).toBe(false);
  });
});

describe("a venue with a gift shop", () => {
  it("is the venue, not Shopping", () => {
    expect(inferType(["establishment", "museum", "point_of_interest", "store", "tourist_attraction"])).toEqual({ type: "activity", sub_type: "guided" }); // Ryman Auditorium
    expect(inferType(["clothing_store", "establishment", "store"])).toEqual({ type: "activity", sub_type: "shopping" });
    expect(inferType(["establishment", "point_of_interest", "store"])).toEqual({ type: "activity", sub_type: "shopping" });
  });
});

describe("camps", () => {
  it("a summer camp is a Camp, whatever Google calls it", () => {
    expect(inferTypeOrSight(["establishment", "point_of_interest"], "Summer Camp Barcelona Enforex")).toEqual({ type: "activity", sub_type: "camp" });
    expect(inferTypeOrSight(["establishment", "point_of_interest", "school"], "Offlimits Camps")).toEqual({ type: "activity", sub_type: "camp" });
  });
  it("a campground is somewhere to sleep", () => {
    expect(isCampName("Camping La Rustica")).toBe(false);
    expect(isCampName("Lake Louise Campground")).toBe(false);
    expect(inferTypeOrSight(["campground", "lodging"], "Camp Bella Vista").type).toBe("logistics");
  });
});

// Types exactly as Google returned them on the Europe summer (27 Sep 2026).
describe("names and churches", () => {
  it("a church with a gift shop is a sight, not Shopping", () => {
    expect(inferTypeOrSight(["book_store", "church", "establishment", "place_of_worship", "point_of_interest", "store"], "Basílica de la Sagrada Família")).toEqual({ type: "activity", sub_type: "self_directed" });
  });
  it("a station Google calls a premise is transit", () => {
    expect(inferTypeOrSight(["premise", "street_address"], "St Pancras International")).toEqual({ type: "logistics", sub_type: "transit" });
    expect(inferTypeOrSight(["establishment", "point_of_interest"], "Firenze Santa Maria Novella Stazione")).toEqual({ type: "logistics", sub_type: "transit" });
  });
  it("a gelateria is dessert, a café is coffee, a restaurant stays a restaurant", () => {
    expect(inferTypeOrSight(["establishment", "food", "point_of_interest", "store"], "Gelateria La Carraia")).toEqual({ type: "food", sub_type: "dessert" });
    expect(inferTypeOrSight(["establishment", "food", "point_of_interest", "restaurant"], "Caffè Gilli")).toEqual({ type: "food", sub_type: "coffee" });
    expect(inferTypeOrSight(["establishment", "food", "point_of_interest", "restaurant"], "Dishoom Covent Garden")).toEqual({ type: "food", sub_type: "restaurant" });
  });
});
