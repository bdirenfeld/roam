// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import PartyPicker from "./PartyPicker";

afterEach(cleanup);

describe("PartyPicker", () => {
  it("shows adults, each kid's age and seniors (Japan: two adults, kids 10, 8 and 5)", () => {
    render(<PartyPicker party={{ adults: 2, seniors: 0, kids: [10, 8, 5] }} onChange={vi.fn()} labelClass="" />);
    expect(screen.getByText("Adults")).toBeTruthy();
    expect(screen.getByText("Seniors")).toBeTruthy();
    expect((screen.getByLabelText("Kid 1's age") as HTMLSelectElement).value).toBe("10");
    expect((screen.getByLabelText("Kid 3's age") as HTMLSelectElement).value).toBe("5");
  });

  it("adds a kid with an age to set, changes an age, adds a senior", () => {
    const onChange = vi.fn();
    render(<PartyPicker party={{ adults: 2, seniors: 0, kids: [10] }} onChange={onChange} labelClass="" />);
    fireEvent.click(screen.getByLabelText("More kids"));
    expect(onChange).toHaveBeenLastCalledWith({ adults: 2, seniors: 0, kids: [10, 8] });
    fireEvent.change(screen.getByLabelText("Kid 1's age"), { target: { value: "11" } });
    expect(onChange).toHaveBeenLastCalledWith({ adults: 2, seniors: 0, kids: [11] });
    fireEvent.click(screen.getByLabelText("More seniors"));
    expect(onChange).toHaveBeenLastCalledWith({ adults: 2, seniors: 1, kids: [10] });
  });

  it("never lets the trip have nobody on it", () => {
    render(<PartyPicker party={{ adults: 1, seniors: 0, kids: [] }} onChange={vi.fn()} labelClass="" />);
    expect((screen.getByLabelText("Fewer adults") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByLabelText("Kid 1's age")).toBeNull();
  });
});
