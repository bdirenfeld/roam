import { describe, it, expect } from "vitest";
import journeys from "./fixtures/journeys.json";
import { checklistRows, type CheckInput, type CheckRow } from "./checklist";
import { cardLabel, documentLabel, filesFor, otherFiles, rowForCard, rowForDocument, rowLine, rowTap, type BookingFile } from "./files";

// Uploads inside their Bookings row (6 Oct 2026 redesign). Rows from the real
// journeys; files in the two shapes the sheet reads (card_attachments, documents).
type J = CheckInput & { title: string };
const get = (title: string, over: Partial<CheckInput> = {}): CheckInput => {
  const j = (journeys as unknown as J[]).find((x) => x.title === title)!;
  return { ...j, cards: j.cards ?? [], days: j.days ?? [], birthdates: j.birthdates ?? [], ...over };
};
const rowsOf = (input: CheckInput) => Object.fromEntries(checklistRows(input).map((r) => [r.key, r])) as Record<string, CheckRow>;

const file = (over: Partial<BookingFile>): BookingFile => ({
  id: "f1", source: "attachment", fileName: "AC890.pdf", url: "https://signed/AC890.pdf", type: "application/pdf",
  row: "flights", label: "Air Canada", detail: "on LaGuardia Airport", createdAt: "2026-07-01T00:00:00Z", ...over,
});

describe("which row a file belongs to", () => {
  it("a flight card, a rental car, a hotel; anything else is Other files", () => {
    expect(rowForCard({ place: { sub_type: "flight_arrival" } })).toBe("flights");
    expect(rowForCard({ place: { sub_type: "flight_departure" } })).toBe("flights");
    expect(rowForCard({ place: { sub_type: "transit" }, details: { title: "Pick up rental car · Hertz", drop_off: "2026-07-26" } })).toBe("car");
    expect(rowForCard({ place: { sub_type: "hotel" } })).toBe("stays");
    // Pisa airport on Tuscany is a transit card with no car: not a booking row.
    expect(rowForCard({ place: { sub_type: "transit" }, details: {} })).toBeNull();
    expect(rowForCard({ place: { sub_type: "museum" } })).toBeNull();
    expect(rowForCard(null)).toBeNull();
  });
  it("an upload record by the kind the reader gave it", () => {
    expect(rowForDocument("flight")).toBe("flights");
    expect(rowForDocument("hotel")).toBe("stays");
    expect(rowForDocument("car_rental")).toBe("car");
    expect(rowForDocument("activity")).toBeNull();
    expect(rowForDocument("restaurant")).toBeNull();
  });
  it("labels: the airline first, then the place, then the card's title", () => {
    expect(cardLabel({ details: { airline: "Air Canada" }, place: { title: "LaGuardia Airport" } })).toBe("Air Canada");
    expect(cardLabel({ details: {}, place: { title: "Villa Zambaldi" } })).toBe("Villa Zambaldi");
    expect(documentLabel([{ type: "flight_arrival", title: "AC 890 to LGA", airline: "Air Canada" }])).toBe("Air Canada");
    expect(documentLabel([{ type: "hotel", title: "11 Howard" }])).toBe("11 Howard");
    expect(documentLabel(null)).toBeNull();
  });
  it("filesFor / otherFiles split the list", () => {
    const fs = [file({ id: "a" }), file({ id: "b", row: null }), file({ id: "c", row: "car" })];
    expect(filesFor("flights", fs).map((f) => f.id)).toEqual(["a"]);
    expect(otherFiles(fs).map((f) => f.id)).toEqual(["b"]);
  });
});

describe("the row's one line", () => {
  const ny = rowsOf(get("New York (Mia & Daddy)"));
  it("booked flights with an upload name the booking", () => {
    expect(rowLine(ny.flights, [file({})])).toBe("Air Canada · confirmation");
    // A document record (no file) still names it.
    expect(rowLine(ny.flights, [file({ source: "document", url: null })])).toBe("Air Canada · confirmation");
    expect(rowLine(ny.flights, [file({ label: null })])).toBe("Confirmation uploaded");
  });
  it("no upload: the row's own line; Stays always names its hotel and nights", () => {
    expect(rowLine(ny.flights, [])).toBe("23 Jul and 26 Jul");
    expect(rowLine(ny.stays, [file({ row: "stays", label: "11 Howard" })])).toBe("11 Howard · all 3 nights");
  });
  it("a row still to book keeps its search line even with a file", () => {
    expect(rowLine(ny.car, [file({ row: "car" })])).toBe(ny.car.line);
  });
});

describe("what a tap on the row does", () => {
  const tus = rowsOf(get("Tuscany", { airports: ["PSA", "FLR"] }));
  const ny = rowsOf(get("New York (Mia & Daddy)"));
  it("still to book: its Kayak search; Stays opens Where to stay (a cruise keeps Kayak)", () => {
    expect(rowTap(tus.flights, [], true)).toEqual({ kind: "kayak", url: tus.flights.url });
    const t = get("Tuscany", { airports: ["PSA"] });
    const open = rowsOf({ ...t, cards: t.cards.filter((c) => c.place?.title !== "Villa Zambaldi") }).stays;
    expect(rowTap(open, [], true)).toEqual({ kind: "stays" });
    expect(rowTap(open, [], false)).toEqual({ kind: "kayak", url: open.url });
  });
  it("booked: its confirmation file; several unfold; a record with no file is skipped", () => {
    const f = file({});
    expect(rowTap(ny.flights, [f], true)).toEqual({ kind: "file", file: f });
    expect(rowTap(ny.flights, [f, file({ id: "g" })], true)).toEqual({ kind: "files" });
    expect(rowTap(ny.flights, [file({ source: "document", url: null })], true)).toEqual({ kind: "day", dayId: ny.flights.dayId });
  });
  it("booked with no file: every row, Stays too, opens the day its card is on (6 Oct 2026)", () => {
    expect(tus.stays.dayId).toBeTruthy();
    expect(rowTap(tus.stays, [], true)).toEqual({ kind: "day", dayId: tus.stays.dayId });
    expect(rowTap(ny.flights, [], true)).toEqual({ kind: "day", dayId: ny.flights.dayId });
    expect(ny.flights.dayId).toBeTruthy();
  });
  it("Not needed, or marked booked with nothing to open: the mark's menu, never a dead tap", () => {
    const t = get("Tuscany", { airports: ["PSA"] });
    const m = rowsOf({ ...t, trip: { ...t.trip, booking_checklist: { car: "skip", flights: "booked" } } });
    expect(rowTap(m.car, [], true)).toEqual({ kind: "menu" });
    expect(rowTap(m.flights, [], true)).toEqual({ kind: "menu" });
  });
});
