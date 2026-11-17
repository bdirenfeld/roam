import { describe, it, expect } from "vitest";
import { countryOf, phaseOf, whenTag, ago, isQuiet, filterRows, sortRows, type AdminRow } from "./adminJourneys";

const row = (o: Partial<AdminRow>): AdminRow => ({ id: "x", title: "T", destination: null, start_date: null, end_date: null, owner: "o", created_at: "2026-01-01T00:00:00Z", planned: 0, saved: 0, guests: 0, last_active: null, archived: false, ...o });
const TODAY = "2026-11-17";
const NOW = Date.parse("2026-11-17T12:00:00Z");

describe("admin table", () => {
  it("country is the last part of the destination", () => {
    expect(countryOf("Tuscany, Italy")).toBe("Italy");
    expect(countryOf("Iceland")).toBe("Iceland");
    expect(countryOf("Viet Hung, Ha Noi, Vietnam")).toBe("Vietnam");
    expect(countryOf(null)).toBe("");
  });
  it("tags the dates by how soon", () => {
    expect(whenTag(row({ start_date: "2026-11-20", end_date: "2026-11-27" }), TODAY)).toEqual({ text: "in 3 days", tone: "soon" });
    expect(whenTag(row({ start_date: "2026-11-14", end_date: "2026-11-24" }), TODAY)?.text).toBe("under way");
    expect(whenTag(row({ start_date: "2026-10-09", end_date: "2026-10-12" }), TODAY)?.tone).toBe("past");
    expect(whenTag(row({ start_date: "2027-07-16", end_date: "2027-08-01" }), TODAY)?.text).toBe("in 8 months");
    expect(whenTag(row({}), TODAY)).toBeNull();
    expect(phaseOf(row({ start_date: "2026-11-17" }), TODAY)).toBe("underway");
  });
  it("says how long ago, and fades after two weeks", () => {
    expect(ago("2026-11-17T11:48:00Z", NOW)).toBe("12 min ago");
    expect(ago("2026-11-17T09:00:00Z", NOW)).toBe("3 h ago");
    expect(ago("2026-11-16T10:00:00Z", NOW)).toBe("yesterday");
    expect(ago("2026-10-10T12:00:00Z", NOW)).toBe("5 weeks ago");
    expect(isQuiet("2026-11-10T00:00:00Z", NOW)).toBe(false);
    expect(isQuiet("2026-10-10T00:00:00Z", NOW)).toBe(true);
  });
  it("filters by phase and by any of name, place or person", () => {
    const rows = [row({ id: "a", title: "Iceland", destination: "Iceland", owner: "Don", start_date: "2027-07-16", end_date: "2027-08-01" }),
                  row({ id: "b", title: "Muskoka", destination: "Ontario, Canada", owner: "Jordan", start_date: "2026-10-09", end_date: "2026-10-12" })];
    expect(filterRows(rows, "", "past", TODAY).map((r) => r.id)).toEqual(["b"]);
    expect(filterRows(rows, "canada", "all", TODAY).map((r) => r.id)).toEqual(["b"]);
    expect(filterRows(rows, "don", "all", TODAY).map((r) => r.id)).toEqual(["a"]);
  });
  it("sorts by country, then by anything, both ways", () => {
    const rows = [row({ id: "it", destination: "Tuscany, Italy", planned: 58 }), row({ id: "ca", destination: "Ontario, Canada", planned: 8 }), row({ id: "is", destination: "Iceland", planned: 19 })];
    expect(sortRows(rows, "country", false).map((r) => r.id)).toEqual(["ca", "is", "it"]);
    expect(sortRows(rows, "country", true).map((r) => r.id)).toEqual(["it", "is", "ca"]);
    expect(sortRows(rows, "planned", true).map((r) => r.id)).toEqual(["it", "is", "ca"]);
  });
});
