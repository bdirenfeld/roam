import { describe, it, expect, vi } from "vitest";
import { FUNNEL, flushFunnel, funnelEvent, funnelSource, sourceFromSearch } from "./funnel";

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

// 13 Oct 2026: Clarity loads after the page mounts, so landing_view and the
// source tag were sent into nothing. They now wait and are handed over.
describe("events sent before Clarity loads", () => {
  it("wait on the window and reach Clarity once it loads, in order, once", () => {
    const win: { clarity?: (...a: unknown[]) => void } = {};
    funnelSource("?utm_source=instagram", win);
    funnelEvent(FUNNEL.landingView, win);
    const clarity = vi.fn();
    win.clarity = clarity;
    flushFunnel(win);
    expect(clarity.mock.calls).toEqual([["set", "source", "instagram"], ["event", "landing_view"]]);
    flushFunnel(win);
    expect(clarity).toHaveBeenCalledTimes(2);
  });
});
