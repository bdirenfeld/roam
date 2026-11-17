import { describe, it, expect } from "vitest";
import { looksLikePortCall } from "./portHint";

// Don's ports as he first entered them (live rows, 17 Nov 2026).
const town = (title: string, address: string, start = "07:00:00", end = "18:00:00") =>
  ({ start_time: start, end_time: end, place: { type: "activity", sub_type: "self_directed", title, address } });

describe("looks like a port of call", () => {
  it("a town visited for the day", () => {
    expect(looksLikePortCall(town("Grundarfjörður", "350 Grundarfjörður, Iceland"))).toBe(true);
    expect(looksLikePortCall(town("Akureyri", "Akureyri, Iceland", "07:00:00", "16:00:00"))).toBe(true);
    expect(looksLikePortCall(town("Seydisfjordur", "710 Seydisfjordur, Iceland"))).toBe(true);
  });
  it("not a place with a street, a short stop, an afternoon start, or no end", () => {
    expect(looksLikePortCall(town("Blue Lagoon", "Blue Lagoon, 241, Iceland", "10:45:00", "13:15:00"))).toBe(false);
    expect(looksLikePortCall(town("Café Loki", "Lokastígur 28, 101 Reykjavík, Iceland"))).toBe(false);
    expect(looksLikePortCall(town("Akureyri", "Akureyri, Iceland", "13:00:00", "18:00:00"))).toBe(false);
    expect(looksLikePortCall({ ...town("Akureyri", "Akureyri, Iceland"), end_time: null })).toBe(false);
    expect(looksLikePortCall({ ...town("Akureyri", "Akureyri, Iceland"), place: { type: "logistics", sub_type: "port", title: "Akureyri", address: "Akureyri, Iceland" } })).toBe(false);
  });
});
