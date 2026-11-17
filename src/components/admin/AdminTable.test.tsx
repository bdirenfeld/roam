// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AdminTable from "./AdminTable";
import type { AdminRow } from "@/lib/adminJourneys";

const row = (o: Partial<AdminRow>): AdminRow => ({ id: "x", title: "T", destination: null, start_date: "2027-01-01", end_date: "2027-01-05", owner: "o", created_at: "2026-01-01T00:00:00Z", planned: 0, saved: 0, guests: 0, last_active: "2026-11-01T00:00:00Z", archived: false, ...o });
const rows = [
  row({ id: "it", title: "Tuscany", destination: "Tuscany, Italy", owner: "Brennan", last_active: "2026-11-17T09:00:00Z" }),
  row({ id: "ca", title: "Muskoka", destination: "Ontario, Canada", owner: "Jordan", last_active: "2026-10-01T00:00:00Z" }),
  row({ id: "is", title: "Iceland", destination: "Iceland", owner: "Don", last_active: "2026-11-17T11:00:00Z" }),
];
const order = () => screen.getAllByTestId("admin-row").map((r) => r.querySelector("a")!.textContent);

describe("admin table (17 Nov 2026)", () => {
  it("starts with the most recently active, sorts by country on a click and flips on a second", () => {
    render(<AdminTable rows={rows} />);
    expect(order()).toEqual(["Iceland", "Tuscany", "Muskoka"]);
    fireEvent.click(screen.getByRole("button", { name: /^Country/ }));
    expect(order()).toEqual(["Muskoka", "Iceland", "Tuscany"]);
    fireEvent.click(screen.getByRole("button", { name: /^Country/ }));
    expect(order()).toEqual(["Tuscany", "Iceland", "Muskoka"]);
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
