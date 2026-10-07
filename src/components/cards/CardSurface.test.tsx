// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import CardSurface from "./CardSurface";
import type { Card } from "@/types/database";

/**
 * Row E (24 Sep 2026), rendered. The rail is the time and nothing else; the
 * category glyph leads the subtitle instead of the category word; every row
 * carries a tile, note or place, photo or not. Shapes copied from Tuscany
 * Day 8 rows: a restaurant with an address, and a note with no place.
 */
const placeCard = {
  id: "c1", trip_id: "t", day_id: "d", place_id: "p1", status: "in_itinerary", position: 3,
  start_time: "12:30:00", end_time: null, confirmed: false, archived: false, details: null,
  place: {
    id: "p1", title: "Trattoria Mario", type: "food", sub_type: "restaurant", lat: 43.77, lng: 11.25,
    address: "Via Rosina, 2r, 50123 Firenze FI, Italy", google_place_id: "g", cover_image_url: null,
    rating: 4.6, price_level: 2, website: null, phone: null, hours: null, loved: false, loved_at: null,
  },
} as unknown as Card;

const noteCard = {
  id: "c2", trip_id: "t", day_id: "d", place_id: null, status: "in_itinerary", position: 5,
  start_time: "15:30:00", end_time: "18:30:00", confirmed: false, archived: false,
  details: { title: "Back from Florence, last swim", notes: "3pm train home. Dinner in Lucca at 7:30." },
  place: null,
} as unknown as Card;

describe("CardSurface — Row E", () => {
  it("draws no pin number on the row; the rail is only the time", () => {
    const { container } = render(<CardSurface card={placeCard} dayDate="2027-08-31" pinIndex={3} />);
    expect(container.querySelector('[aria-label^="Pin "]')).toBeNull();
    expect(container.textContent).toMatch(/12:30/);
    expect(container.textContent).not.toMatch(/(^|\D)3(\D|$)/);
  });

  it("leads the subtitle with the category glyph, not the category word", () => {
    const { container } = render(<CardSurface card={placeCard} dayDate="2027-08-31" />);
    expect(container.textContent).not.toMatch(/Restaurant ·/);
    expect(container.textContent).toMatch(/Via Rosina/);
    expect(container.querySelector(".material-symbols-outlined")?.textContent).toBe("restaurant");
  });

  it("gives a note the default tile so the column never drops out", () => {
    const { container } = render(<CardSurface card={noteCard} dayDate="2027-08-31" />);
    const glyphs = Array.from(container.querySelectorAll(".material-symbols-outlined")).map((e) => e.textContent);
    expect(glyphs).toContain("edit_note");
    expect(container.querySelector("img")).toBeNull();
  });

  it("is two lines, no exceptions: the rating sits on the meta line, not a third", () => {
    const { container } = render(<CardSurface card={placeCard} dayDate="2027-08-31" />);
    const title = Array.from(container.querySelectorAll("p")).find((e) => /Trattoria Mario/.test(e.textContent ?? ""));
    expect(title).toBeTruthy();
    const meta = title!.parentElement!.nextElementSibling as HTMLElement;
    expect(meta.textContent).toMatch(/Via Rosina/);
    expect(meta.textContent).toMatch(/★ 4\.6/);
    // nothing renders after the meta line inside the text column
    expect(meta.nextElementSibling).toBeNull();
  });

  it("gives a place its photo inside the same tile", () => {
    const { container } = render(<CardSurface card={placeCard} dayDate="2027-08-31" />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toContain("place_id=p1");
  });
});

describe("the time chip is finger-sized (6 Oct 2026, taps audit)", () => {
  it("a tap on the wider target around the label opens the time sheet, not the card", async () => {
    const { fireEvent } = await import("@testing-library/react");
    const calls: string[] = [];
    const { getByTestId } = render(<CardSurface card={placeCard} onTap={() => calls.push("card")} onTimeTap={() => calls.push("time")} />);
    const target = getByTestId("time-chip-target");
    expect(target.className).toContain("-inset-y-[13px]");
    fireEvent.click(target);
    expect(calls).toEqual(["time"]);
  });
});

/**
 * The Booked pill on the card's face is status, not a control (6 Oct 2026,
 * taps audit): one tap on it un-booked the card with no toast and no Undo.
 * Booking and un-booking is the Booked switch in the card's ⋯ menu; a tap on
 * the pill opens the card like the rest of the row.
 */
describe("CardSurface — the Booked pill", () => {
  const booked = { ...placeCard, confirmed: true } as unknown as Card;

  it("is not a button, and a tap on it opens the card instead of un-booking", () => {
    const onTap = vi.fn();
    const unbook = vi.fn();
    // Even a host that still hands over the old handler cannot un-book from the face.
    const legacy = { onToggleConfirmed: unbook } as object;
    const { getByText, getAllByRole } = render(<CardSurface card={booked} dayDate="2027-08-31" onTap={onTap} {...legacy} />);
    const pill = getByText("Booked").closest("span") as HTMLElement;
    expect(pill.getAttribute("role")).toBeNull();
    expect(pill.getAttribute("tabindex")).toBeNull();
    // The only button is the card itself.
    expect(getAllByRole("button")).toHaveLength(1);
    fireEvent.click(pill);
    expect(unbook).not.toHaveBeenCalled();
    expect(onTap).toHaveBeenCalledTimes(1);
  });

  it("looks the same: still the tick and the word, in the green tint", () => {
    const { getByText } = render(<CardSurface card={booked} dayDate="2027-08-31" />);
    const pill = getByText("Booked").closest("span") as HTMLElement;
    expect(pill.getAttribute("aria-label")).toBe("Booked");
    expect(pill.className).toContain("rounded-[5px]");
    expect(pill.querySelector("svg")).toBeTruthy();
  });
});
