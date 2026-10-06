import { describe, it, expect } from "vitest";
import { isOwnCredit } from "./photoCredit";

// Real credits from his Tuscany places (places.details.photos, 6 Oct 2026).
describe("isOwnCredit", () => {
  it("is true when the business uploaded the photo — the credit is its own name", () => {
    expect(isOwnCredit('<a href="https://maps.google.com/maps/contrib/105092786094528640139">Buca di Sant&#39;Antonio</a>', "Buca di Sant'Antonio")).toBe(true);
    expect(isOwnCredit('<a href="https://maps.google.com/maps/contrib/116124878298660147335">Mafalda Lardo di Colonnata IGP</a>', "Mafalda Lardo di Colonnata IGP")).toBe(true);
  });

  it("is false for a photographer's credit, which stays on the photo", () => {
    expect(isOwnCredit('<a href="https://maps.google.com/maps/contrib/117781893734038041375">Francisco Pardo</a>', "Buca di Sant'Antonio")).toBe(false);
    expect(isOwnCredit('<a href="x">Debra Nelson, Psy.D.</a>', "Buca di Sant'Antonio")).toBe(false);
  });

  it("is false with nothing to compare", () => {
    expect(isOwnCredit(null, "Buca")).toBe(false);
    expect(isOwnCredit("<a>Buca</a>", null)).toBe(false);
    expect(isOwnCredit("<a></a>", "")).toBe(false);
  });
});
