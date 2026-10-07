import { describe, it, expect } from "vitest";
import { dayMoment, townOf } from "./dayMoment";

// The first and last day of a journey (7 Oct 2026, delight audit).
describe("dayMoment", () => {
  const D = "Irving, TX, USA";
  it("Day 1: the town and a good wish", () => {
    expect(dayMoment("2027-03-14", "2027-03-17", "2027-03-14", D)).toBe("Day 1 in Irving · have a great trip");
  });
  it("the last day", () => {
    expect(dayMoment("2027-03-14", "2027-03-17", "2027-03-17", D)).toBe("Last day in Irving");
  });
  it("a one-day trip is its own first day", () => {
    expect(dayMoment("2027-03-14", "2027-03-14", "2027-03-14", D)).toBe("Day 1 in Irving · have a great trip");
  });
  it("the days in between say nothing", () => {
    expect(dayMoment("2027-03-14", "2027-03-17", "2027-03-15", D)).toBeNull();
    expect(dayMoment("2027-03-14", "2027-03-17", "2027-03-16", D)).toBeNull();
  });
  it("before and after the trip say nothing", () => {
    expect(dayMoment("2027-03-14", "2027-03-17", "2027-03-13", D)).toBeNull();
    expect(dayMoment("2027-03-14", "2027-03-17", "2027-03-18", D)).toBeNull();
  });
  it("across a month and a clock change, by calendar day", () => {
    expect(dayMoment("2027-03-13", "2027-04-01", "2027-04-01", "Tuscany, Italy")).toBe("Last day in Tuscany");
  });
  it("timestamps are read as their date", () => {
    expect(dayMoment("2027-03-14T00:00:00", "2027-03-17T00:00:00", "2027-03-14", D)).toBe("Day 1 in Irving · have a great trip");
  });
  it("missing or backwards dates say nothing", () => {
    expect(dayMoment(null, "2027-03-17", "2027-03-17", D)).toBeNull();
    expect(dayMoment("2027-03-14", undefined, "2027-03-14", D)).toBeNull();
    expect(dayMoment("2027-03-17", "2027-03-14", "2027-03-17", D)).toBeNull();
  });
  it("no destination: the line without a town", () => {
    expect(dayMoment("2027-03-14", "2027-03-17", "2027-03-14", null)).toBe("Day 1 · have a great trip");
    expect(dayMoment("2027-03-14", "2027-03-17", "2027-03-17", "  ")).toBe("Last day");
  });
});

describe("townOf", () => {
  it("the first comma-part", () => {
    expect(townOf("Irving, TX, USA")).toBe("Irving");
    expect(townOf("Tuscany, Italy")).toBe("Tuscany");
    expect(townOf("Lisbon")).toBe("Lisbon");
    expect(townOf("  Kyoto ,Japan")).toBe("Kyoto");
  });
  it("nothing to say", () => {
    expect(townOf(null)).toBeNull();
    expect(townOf("")).toBeNull();
    expect(townOf(", Italy")).toBeNull();
  });
});
