import { describe, it, expect } from "vitest";
import { fitWithin, shrinkPicture } from "./picture";
describe("a picture on its way out", () => {
  it("fits the long side and never grows", () => {
    expect(fitWithin(4000, 3000, 1600)).toEqual({ w: 1600, h: 1200 });
    expect(fitWithin(300, 900, 1600)).toEqual({ w: 300, h: 900 });
    expect(fitWithin(10000, 2, 1600)).toEqual({ w: 1600, h: 1 });
  });
  it("says no to what it can't read, never sending the original", async () => {
    expect(await shrinkPicture(new Blob(["x"]))).toBeNull();
  });
});
