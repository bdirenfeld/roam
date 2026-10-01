import { describe, it, expect } from "vitest";
import { extractBookings, CONFIRMATION_PROMPT } from "./prompt";

describe("reading Claude's answer to a confirmation", () => {
  it("a package comes back as one booking each", () => {
    const text = '[{"type":"flight_arrival","title":"AC8458"},{"type":"flight_departure","title":"AC713"},{"type":"hotel","title":"11 Howard"},{"type":"car_rental","title":"Hertz"}]';
    expect(extractBookings(text).map((b) => b.type)).toEqual(["flight_arrival", "flight_departure", "hotel", "car_rental"]);
  });
  it("finds the array inside fences or prose, and wraps a lone object", () => {
    expect(extractBookings('```json\n[{"type":"hotel","title":"Villa"}]\n```')).toHaveLength(1);
    expect(extractBookings('Here you go: {"type":"hotel","title":"Villa"}')).toHaveLength(1);
  });
  it("drops anything that is not a booking", () => {
    expect(extractBookings('[{"type":"hotel","title":"Villa"},{"note":"x"},null]')).toHaveLength(1);
  });
  it("says so when there is no JSON at all", () => expect(() => extractBookings("sorry")).toThrow());
  it("asks for one object per booking, cars included", () => {
    expect(CONFIRMATION_PROMPT).toMatch(/ONE object per booking/);
    expect(CONFIRMATION_PROMPT).toMatch(/car_rental/);
    expect(CONFIRMATION_PROMPT).toMatch(/drop_off_date/);
  });
});
