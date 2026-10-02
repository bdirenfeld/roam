// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeAll } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";

/**
 * The how-to video surfaces, rendered (2 Oct 2026, video-placement-mock):
 * the Journeys page card, the shared link's strip, and the player itself.
 * The Start here card and the menu tile have their own files.
 *
 * The real hook runs here; only the network is faked — videos.json from the
 * bucket, and Supabase (a signed-in reader with nothing seen yet).
 */

const rpc = vi.fn(() => Promise.resolve({ error: null }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: { getSession: () => Promise.resolve({ data: { session: { user: { id: "u1" } } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { videos_seen: {} }, error: null }) }) }) }),
    rpc: (...a: unknown[]) => ({ then: (ok: (v: { error: null }) => void) => (rpc as (...x: unknown[]) => Promise<{ error: null }>)(...a).then(ok) }),
  }),
}));

const manifest = { "first-journey": 1, "planning-computer": 1, "on-the-trip": 2 };
beforeAll(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(manifest) })));
});

import FirstJourneyVideo from "./FirstJourneyVideo";
import SharedVideoStrip from "./SharedVideoStrip";
import VideoPlayer from "./VideoPlayer";

afterEach(() => { cleanup(); });

describe("the Journeys page, no journeys yet", () => {
  it("video 1's card takes the pin tile's place; ✕ brings the tile back for good and saves it to the account", async () => {
    render(<FirstJourneyVideo />);
    const play = await screen.findByRole("button", { name: "Watch: Your first journey, 1 min" });
    expect(play.textContent).toContain("Watch: Your first journey");
    expect(play.textContent).toContain("· 1 min");
    expect(play.querySelector("img")!.getAttribute("src")).toContain("/how-to-videos/first-journey.jpg?v=1");
    expect(screen.queryByTestId("video-player")).toBeNull(); // never plays by itself
    fireEvent.click(screen.getByRole("button", { name: "Close video" }));
    expect(screen.queryByTestId("first-journey-video")).toBeNull();
    expect(rpc).toHaveBeenCalledWith("mark_video_seen", { video: "first-journey" });
    expect(window.localStorage.getItem("roam:video-seen:first-journey")).toBeTruthy();
    // Another mount on the same page load (e.g. the phone's Start here) agrees.
    cleanup();
    render(<FirstJourneyVideo />);
    expect(screen.queryByTestId("first-journey-video")).toBeNull();
  });
});

describe("the shared link, a visitor with no account", () => {
  it("first open: one strip above the cover; playing it hides it on this device", async () => {
    window.localStorage.removeItem("roam:video-seen:on-the-trip");
    render(<SharedVideoStrip />);
    const strip = await screen.findByTestId("shared-video-strip");
    expect(strip.textContent).toBe("New here? Watch how this works · 45 s");
    fireEvent.click(screen.getByRole("button", { name: /Watch how this works/ }));
    expect(screen.queryByTestId("shared-video-strip")).toBeNull();
    const video = screen.getByTestId("video-player").querySelector("video")!;
    expect(video.getAttribute("src")).toContain("/how-to-videos/on-the-trip.mp4?v=2");
    expect(window.localStorage.getItem("roam:video-seen:on-the-trip")).toBeTruthy();
    cleanup();
    render(<SharedVideoStrip />);
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByTestId("shared-video-strip")).toBeNull();
  });

  it("✕ on a fresh device: gone, and no account write (there is no account)", async () => {
    window.localStorage.removeItem("roam:video-seen:on-the-trip");
    rpc.mockClear();
    render(<SharedVideoStrip />);
    await screen.findByTestId("shared-video-strip");
    fireEvent.click(screen.getByRole("button", { name: "Close video" }));
    expect(screen.queryByTestId("shared-video-strip")).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("storage that throws (private mode) still renders, and ✕ still works", async () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("blocked"); });
    render(<SharedVideoStrip />);
    await screen.findByTestId("shared-video-strip");
    fireEvent.click(screen.getByRole("button", { name: "Close video" }));
    expect(screen.queryByTestId("shared-video-strip")).toBeNull();
    get.mockRestore(); set.mockRestore();
  });
});

describe("the player", () => {
  it("native controls, inline on a phone; ✕, Escape and a swipe down each close it", async () => {
    const onClose = vi.fn();
    render(<VideoPlayer title="On the trip" src="https://x/v.mp4" onClose={onClose} />);
    const dialog = screen.getByRole("dialog", { name: "On the trip" });
    const video = dialog.querySelector("video")!;
    expect(video.hasAttribute("controls")).toBe(true);
    expect(video.hasAttribute("playsinline")).toBe(true);
    expect(video.className).toContain("object-contain"); // a 16:9 video fits a phone turned sideways
    expect(dialog.parentElement).toBe(document.body); // above every host's stacking context
    fireEvent.click(screen.getByRole("button", { name: "Close video" }));
    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.touchStart(dialog, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchEnd(dialog, { changedTouches: [{ clientX: 110, clientY: 260 }] });
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(3));
  });

  it("on a phone it is full screen: no centred frame, no dim page behind it (2 Oct 2026)", () => {
    // jsdom has no matchMedia: the phone path, as on a phone.
    render(<VideoPlayer title="x" src="https://x/v.mp4" onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("data-layout")).toBe("full");
    expect(dialog.className).toContain("inset-0");
    expect(screen.queryByTestId("video-frame")).toBeNull();
    expect(dialog.querySelector("video")!.className).toContain("w-full h-full");
  });

  describe("on a computer: a centred player over the dimmed page (2 Oct 2026)", () => {
    const realMM = window.matchMedia;
    const realW = window.innerWidth, realH = window.innerHeight;
    const wideScreen = (w: number, h: number) => {
      window.matchMedia = ((q: string) => ({
        matches: q === "(min-width: 768px)", media: q, onchange: null,
        addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false,
      })) as unknown as typeof window.matchMedia;
      Object.defineProperty(window, "innerWidth", { configurable: true, value: w });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: h });
    };
    afterEach(() => {
      window.matchMedia = realMM;
      Object.defineProperty(window, "innerWidth", { configurable: true, value: realW });
      Object.defineProperty(window, "innerHeight", { configurable: true, value: realH });
    });

    it("two-thirds of a 1200 px window at 16:9, the page dimmed, not blacked out", () => {
      wideScreen(1200, 900);
      render(<VideoPlayer title="Planning on a computer" src="https://x/v.mp4" onClose={vi.fn()} />);
      const dialog = screen.getByRole("dialog", { name: "Planning on a computer" });
      expect(dialog.getAttribute("data-layout")).toBe("centred");
      const frame = screen.getByTestId("video-frame");
      expect(frame.style.width).toBe("800px");
      expect(frame.style.height).toBe("450px");
      expect(dialog.style.background).toMatch(/rgba\(14, 14, 22, 0\.72\)/);
      expect(frame.querySelector("video")!.hasAttribute("controls")).toBe(true);
      expect(dialog.parentElement).toBe(document.body);
    });

    it("never wider than 960 px, and a 4:5 video keeps its shape once the file says so", () => {
      wideScreen(2560, 1440);
      render(<VideoPlayer title="x" src="https://x/v.mp4" onClose={vi.fn()} />);
      const frame = screen.getByTestId("video-frame");
      expect(frame.style.width).toBe("960px");
      const video = frame.querySelector("video")!;
      Object.defineProperty(video, "videoWidth", { configurable: true, value: 1080 });
      Object.defineProperty(video, "videoHeight", { configurable: true, value: 1350 });
      fireEvent(video, new Event("loadedmetadata"));
      const w = parseFloat(frame.style.width), h = parseFloat(frame.style.height);
      expect(w / h).toBeCloseTo(0.8, 2);
      expect(h).toBeLessThanOrEqual(1440 * 0.8);
    });

    it("✕, Escape and a click on the dim close it; a click on the video does not", async () => {
      wideScreen(1440, 900);
      const onClose = vi.fn();
      render(<VideoPlayer title="x" src="https://x/v.mp4" onClose={onClose} />);
      const dialog = screen.getByRole("dialog");
      fireEvent.click(screen.getByTestId("video-frame").querySelector("video")!);
      expect(onClose).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole("button", { name: "Close video" }));
      fireEvent.keyDown(document, { key: "Escape" });
      fireEvent.click(dialog);
      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(3));
    });
  });

  it("a sideways swipe (scrubbing) does not close it", () => {
    const onClose = vi.fn();
    render(<VideoPlayer title="x" src="https://x/v.mp4" onClose={onClose} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.touchStart(dialog, { touches: [{ clientX: 20, clientY: 100 }] });
    fireEvent.touchEnd(dialog, { changedTouches: [{ clientX: 300, clientY: 200 }] });
    expect(onClose).not.toHaveBeenCalled();
  });
});
