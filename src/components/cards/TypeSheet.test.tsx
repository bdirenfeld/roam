// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { TypeSheet } from "./TypeSheet";

/**
 * The card's type picker is a sheet that opens on the card's own group
 * (18 Nov 2026, clickable mock approved). A tour opens on Activity with Tour
 * chosen; Food is one tap away; a chip picks at once; Escape and the scrim close.
 */
const OPTIONS = {
  food: [{ value: "bakery", label: "Bakery" }, { value: "restaurant", label: "Restaurant" }],
  activity: [{ value: "guided", label: "Tour" }, { value: "park", label: "Park" }, { value: "zoo", label: "Zoo" }],
  logistics: [{ value: "car_rental", label: "Car rental" }, { value: "hotel", label: "Hotel" }],
};
const open = (type = "activity", sub: string | null = "guided") => {
  const onSelect = vi.fn(), onClose = vi.fn();
  render(<TypeSheet currentType={type} currentSubType={sub} options={OPTIONS} onSelect={onSelect} onClose={onClose} />);
  return { onSelect, onClose };
};
const visibleGroup = () => screen.getAllByRole("radiogroup", { hidden: true }).find((g) => g.getAttribute("aria-hidden") === "false")!;

describe("TypeSheet", () => {
  it("opens on the card's own group, with its kind chosen", () => {
    open();
    expect(screen.getByRole("tab", { name: "Activity" }).getAttribute("aria-selected")).toBe("true");
    expect(visibleGroup().getAttribute("aria-label")).toBe("Activity");
    expect(within(visibleGroup()).getByRole("radio", { name: /Tour/ }).getAttribute("aria-checked")).toBe("true");
  });

  it("one tap picks a kind in the same group", () => {
    const { onSelect } = open();
    fireEvent.click(within(visibleGroup()).getByRole("radio", { name: /Park/ }));
    expect(onSelect).toHaveBeenCalledWith("activity", "park");
  });

  it("switching group shows its chips, none chosen, and a chip there moves the card across", () => {
    const { onSelect } = open();
    fireEvent.click(screen.getByRole("tab", { name: "Food" }));
    expect(visibleGroup().getAttribute("aria-label")).toBe("Food");
    expect(within(visibleGroup()).queryAllByRole("radio").some((r) => r.getAttribute("aria-checked") === "true")).toBe(false);
    fireEvent.click(within(visibleGroup()).getByRole("radio", { name: /Restaurant/ }));
    expect(onSelect).toHaveBeenCalledWith("food", "restaurant");
  });

  it("keeps every group in the layout, so the sheet never changes height", () => {
    open();
    const groups = screen.getAllByRole("radiogroup", { hidden: true });
    expect(groups.map((g) => g.getAttribute("aria-label"))).toEqual(["Food", "Activity", "Logistics"]);
    expect(groups.filter((g) => g.className.includes("invisible"))).toHaveLength(2);
  });

  it("closes from the scrim, the × and Escape, without picking anything", () => {
    const { onSelect, onClose } = open("logistics", "car_rental");
    fireEvent.click(screen.getByTestId("type-sheet-scrim"));
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(3);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("a card with no known group opens on Activity", () => {
    open("note", null);
    expect(screen.getByRole("tab", { name: "Activity" }).getAttribute("aria-selected")).toBe("true");
  });
});

describe("TypeSheet on a note: Drive and Train by name (25 Nov 2026)", () => {
  // Brennan: "when you click on the card, you don't have the ability to change it to a drive".
  // The merged picker (19 Nov) only said "Transit". A note now offers Drive and Train in Logistics.
  const options = { food: [{ value: "restaurant", label: "Restaurant" }], activity: [{ value: "explore", label: "Explore" }], logistics: [{ value: "hotel", label: "Hotel" }, { value: "transit", label: "Transit" }, { value: "grocery", label: "Grocery" }] };
  const base = { currentType: "", currentSubType: null, options, onSelect: () => {}, onClose: () => {}, note: { on: true, onPick: () => {} } };
  const logistics = () => { fireEvent.click(screen.getByRole("tab", { name: "Logistics" })); return screen.getByRole("radiogroup", { name: "Logistics" }); };
  // A chip is its glyph (an icon-font word) and then its name: read the name.
  const nm = (b: Element) => (b.lastChild?.textContent ?? "").trim();
  const names = (g: HTMLElement) => Array.from(g.querySelectorAll("[role=radio]")).map(nm);

  it("shows Drive and Train where Transit was, and keeps the rest", () => {
    render(<TypeSheet {...base} travel={{ current: null, onPick: () => {} }} />);
    expect(names(logistics())).toEqual(["Hotel", "Drive", "Train", "Grocery"]);
  });

  it("picking Train says train, not a place kind", () => {
    const onPick = vi.fn(), onSelect = vi.fn();
    render(<TypeSheet {...base} onSelect={onSelect} travel={{ current: null, onPick }} />);
    fireEvent.click(Array.from(logistics().querySelectorAll("[role=radio]")).find((b) => nm(b) === "Train")!);
    expect(onPick).toHaveBeenCalledWith("train");
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("a note that is already a drive opens on Logistics with Drive chosen", () => {
    render(<TypeSheet {...base} currentType="logistics" currentSubType="transit" travel={{ current: "drive", onPick: () => {} }} />);
    const g = screen.getByRole("radiogroup", { name: "Logistics" });
    const chosen = Array.from(g.querySelectorAll("[role=radio][aria-checked=true]")).map(nm);
    expect(chosen).toEqual(["Drive"]);
  });

  it("a card with a real place still says Transit (its way of travelling is picked on the card)", () => {
    render(<TypeSheet currentType="logistics" currentSubType="hotel" options={options} onSelect={() => {}} onClose={() => {}} />);
    expect(names(screen.getByRole("radiogroup", { name: "Logistics" }))).toEqual(["Hotel", "Transit", "Grocery"]);
  });
});
