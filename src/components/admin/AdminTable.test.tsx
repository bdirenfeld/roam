// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import AdminTable from "./AdminTable";
import type { AdminRow } from "@/lib/adminJourneys";

const row = (o: Partial<AdminRow>): AdminRow => ({ id: "x", title: "T", destination: null, start_date: "2027-01-01", end_date: "2027-01-05", owner: "o", created_at: "2026-01-01T00:00:00Z", planned: 0, saved: 0, guests: 0, last_active: "2026-11-01T00:00:00Z", archived: false, ...o });
const rows = [
  row({ id: "it", title: "Tuscany", destination: "Tuscany, Italy", owner: "Brennan", last_active: "2026-11-17T09:00:00Z" }),
  row({ id: "ca", title: "Muskoka", destination: "Ontario, Canada", owner: "Jordan", last_active: "2026-10-01T00:00:00Z" }),
  row({ id: "is", title: "Iceland", destination: "Iceland", owner: "Don", last_active: "2026-11-17T11:00:00Z" }),
  row({ id: "ro", title: "Rome", destination: "Rome, Italy", owner: "Brennan", last_active: "2026-09-01T00:00:00Z" }),
];
const order = () => screen.queryAllByTestId("admin-row").map((r) => r.querySelector("a")!.textContent);
const heading = (name: RegExp) => screen.getByRole("button", { name });
const tick = (menu: HTMLElement, label: string) => fireEvent.click(within(menu).getByRole("checkbox", { name: new RegExp(label) }));

describe("admin table (17–18 Nov 2026)", () => {
  it("columns read Owner, Country, Journey … Last active", () => {
    render(<AdminTable rows={rows} />);
    const heads = screen.getAllByRole("columnheader").map((h) => h.textContent!.replace(/[▾↑↓\d]/g, "").trim()).filter(Boolean);
    expect(heads).toEqual(["Owner", "Country", "Journey", "Dates", "Planned", "Saved", "Guests", "Last active"]);
  });
  it("starts with the most recently active; Journey sorts on a click and flips on a second", () => {
    render(<AdminTable rows={rows} />);
    expect(order()).toEqual(["Iceland", "Tuscany", "Muskoka", "Rome"]);
    fireEvent.click(heading(/^Journey/));
    expect(order()).toEqual(["Iceland", "Muskoka", "Rome", "Tuscany"]);
    fireEvent.click(heading(/^Journey/));
    expect(order()).toEqual(["Tuscany", "Rome", "Muskoka", "Iceland"]);
  });
  it("Owner opens a checklist; nothing changes until Show, and the heading counts the picks", () => {
    render(<AdminTable rows={rows} />);
    fireEvent.click(heading(/^Owner/));
    const menu = screen.getByTestId("pick-owner");
    expect(within(menu).getAllByRole("checkbox").map((c) => (c.closest("label")!.textContent))).toEqual(["(Select all)", "Brennan2", "Don1", "Jordan1"]);
    tick(menu, "Don");
    expect(order()).toHaveLength(4);
    fireEvent.click(within(menu).getByRole("button", { name: "Show 3 journeys" }));
    expect(order()).toEqual(["Tuscany", "Muskoka", "Rome"]);
    expect(heading(/^Owner/).textContent).toContain("2");
  });
  it("clicking away or Escape throws the changes away", () => {
    render(<AdminTable rows={rows} />);
    fireEvent.click(heading(/^Owner/));
    tick(screen.getByTestId("pick-owner"), "Brennan");
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId("pick-owner")).toBeNull();
    expect(order()).toHaveLength(4);
    fireEvent.click(heading(/^Owner/));
    const menu = screen.getByTestId("pick-owner");
    tick(menu, "Brennan");
    fireEvent.keyDown(menu, { key: "Escape" });
    expect(order()).toHaveLength(4);
  });
  it("clicking the heading again closes the menu instead of reopening it", () => {
    render(<AdminTable rows={rows} />);
    fireEvent.click(heading(/^Owner/));
    fireEvent.mouseDown(heading(/^Owner/));
    fireEvent.click(heading(/^Owner/));
    expect(screen.queryByTestId("pick-owner")).toBeNull();
  });
  it("typing narrows the names and ticks only those; Owner and Country combine; Clear filters resets", () => {
    render(<AdminTable rows={rows} />);
    fireEvent.click(heading(/^Owner/));
    const menu = screen.getByTestId("pick-owner");
    fireEvent.change(within(menu).getByLabelText("Search names"), { target: { value: "bren" } });
    expect(within(menu).getAllByRole("checkbox")).toHaveLength(2);
    fireEvent.click(within(menu).getByRole("button", { name: "Show 2 journeys" }));
    expect(order()).toEqual(["Tuscany", "Rome"]);
    fireEvent.click(heading(/^Country/));
    // Like Excel, the list is what the Owner filter leaves: only Italy, with its 2.
    const c = screen.getByTestId("pick-country");
    expect(within(c).getAllByRole("checkbox").map((b) => b.closest("label")!.textContent)).toEqual(["(Select all)", "Italy2"]);
    tick(c, "Italy");
    // Nothing ticked can't be shown: Show is disabled rather than emptying the table.
    expect((within(screen.getByTestId("pick-country")).getByRole("button", { name: /Show 0/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.mouseDown(document.body);
    expect(order()).toEqual(["Tuscany", "Rome"]);
    fireEvent.click(screen.getByRole("button", { name: /Clear filters/ }));
    expect(order()).toHaveLength(4);
  });
  it("a name or country in a row shows only that one; the menu's sort orders the column", () => {
    render(<AdminTable rows={rows} />);
    fireEvent.click(screen.getAllByTitle("Show only Brennan")[0]);
    expect(order()).toEqual(["Tuscany", "Rome"]);
    fireEvent.click(screen.getByRole("button", { name: /Clear filters/ }));
    fireEvent.click(screen.getAllByTitle("Show only Italy")[0]);
    expect(order()).toEqual(["Tuscany", "Rome"]);
    fireEvent.click(screen.getByRole("button", { name: /Clear filters/ }));
    fireEvent.click(heading(/^Country/));
    fireEvent.click(within(screen.getByTestId("pick-country")).getByRole("button", { name: /Sort Z to A/ }));
    expect(order()).toEqual(["Tuscany", "Rome", "Iceland", "Muskoka"]);
  });
  it("search narrows to a person or place; there is no page title", () => {
    render(<AdminTable rows={rows} />);
    fireEvent.change(screen.getByLabelText("Search journeys"), { target: { value: "canada" } });
    expect(order()).toEqual(["Muskoka"]);
    expect(screen.queryByText(/Everyone/)).toBeNull();
  });
  it("each row links to the read-only view", () => {
    render(<AdminTable rows={rows} />);
    expect(screen.getByText("Iceland", { selector: "a" }).getAttribute("href")).toBe("/admin/view/is");
  });
});
