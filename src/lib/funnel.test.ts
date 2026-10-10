import { describe, it, expect, vi } from "vitest";
import { FUNNEL, funnelEvent, funnelSource, sourceFromSearch } from "./funnel";

describe("funnel events", () => {
  it("hands the event to Clarity when it is loaded", () => {
    const clarity = vi.fn();
    funnelEvent(FUNNEL.tripCreated, { clarity });
    expect(clarity).toHaveBeenCalledWith("event", "trip_created");
  });

  it("is silent without Clarity, and swallows a recorder fault", () => {
    expect(() => funnelEvent(FUNNEL.landingView, {})).not.toThrow();
    expect(() => funnelEvent(FUNNEL.landingView, undefined)).not.toThrow();
    expect(() =>
      funnelEvent(FUNNEL.landingView, {
        clarity: () => {
          throw new Error("boom");
        },
      }),
    ).not.toThrow();
  });

  it("reads the short links' utm_source and falls back to direct", () => {
    expect(sourceFromSearch("?utm_source=instagram")).toBe("instagram");
    expect(sourceFromSearch("utm_source=Reddit&x=1")).toBe("reddit");
    expect(sourceFromSearch("")).toBe("direct");
    expect(sourceFromSearch("?utm_source=")).toBe("direct");
    expect(sourceFromSearch("?utm_source=<script>")).toBe("direct");
  });

  it("tags the session with its source", () => {
    const clarity = vi.fn();
    funnelSource("?utm_source=betalist", { clarity });
    expect(clarity).toHaveBeenCalledWith("set", "source", "betalist");
  });
});
