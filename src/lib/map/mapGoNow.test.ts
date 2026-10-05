import { describe, it, expect } from "vitest";
import { mapGoNow } from "./mapGoNow";

const at = (desktop: boolean) => ({ matchMedia: (q: string) => ({ matches: desktop && q === "(min-width: 768px)" }) as MediaQueryList });

describe("mapGoNow", () => {
  it("starts the map at once on desktop", () => {
    expect(mapGoNow(at(true))).toBe(true);
  });
  it("waits on a phone", () => {
    expect(mapGoNow(at(false))).toBe(false);
  });
  it("starts at once when there is nothing to measure", () => {
    expect(mapGoNow(undefined)).toBe(true);
    expect(mapGoNow({} as Window)).toBe(true);
  });
});
