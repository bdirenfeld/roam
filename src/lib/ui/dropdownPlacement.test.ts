import { describe, it, expect } from "vitest";
import { dropdownPlacement } from "./dropdownPlacement";

/**
 * The Destination suggestions on a phone with the keyboard up (2 Oct 2026).
 * Numbers are a 390x844 phone: the overlay's Destination row sits at about
 * 276-324 px; Chrome's keyboard leaves ~470 px visible, iOS ~420 and may pan.
 */

describe("where a field's suggestions go", () => {
  it("a computer, or a phone with no keyboard: below, as before", () => {
    expect(dropdownPlacement({ top: 276, bottom: 324 }, { offsetTop: 0, height: 844 })).toEqual({ side: "below", maxHeight: 512 });
  });

  it("keyboard up, little room under the field: above it, in the space you can see", () => {
    const p = dropdownPlacement({ top: 276, bottom: 324 }, { offsetTop: 0, height: 420 });
    expect(p.side).toBe("above");
    expect(p.maxHeight).toBe(268);
  });

  it("the browser panned the page so the field sits on the keyboard: above, counted from what is visible", () => {
    // iOS scrolled the visible area down 150 px; the field is just above the keyboard.
    const p = dropdownPlacement({ top: 500, bottom: 548 }, { offsetTop: 150, height: 410 });
    expect(p).toEqual({ side: "above", maxHeight: 342 });
  });

  it("room for about four rows below: stays below even if there is more above", () => {
    expect(dropdownPlacement({ top: 400, bottom: 448 }, { offsetTop: 0, height: 680 }).side).toBe("below");
  });

  it("never taller than the room it has, never squeezed to nothing", () => {
    expect(dropdownPlacement({ top: 30, bottom: 70 }, { offsetTop: 0, height: 140 })).toEqual({ side: "below", maxHeight: 96 });
  });
});
