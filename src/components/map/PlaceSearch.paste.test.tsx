// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import PlaceSearch from "./PlaceSearch";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari/537.36";

function setUA(ua: string) { Object.defineProperty(window.navigator, "userAgent", { value: ua, configurable: true }); }

describe("map search: iPhone share by paste (5 Oct 2026)", () => {
  beforeEach(() => { push.mockClear(); });
  afterEach(() => { cleanup(); });

  it("iPhone: the empty, focused search offers the paste row; a copied TikTok link goes to /share", async () => {
    setUA(IPHONE);
    Object.defineProperty(window.navigator, "clipboard", { value: { readText: () => Promise.resolve("🥪 https://vt.tiktok.com/ZSabc123/ #porto") }, configurable: true });
    render(<PlaceSearch onPlaceSelect={() => {}} destination="Porto" />);
    fireEvent.focus(screen.getByPlaceholderText("Search places in Porto…"));
    fireEvent.click(await screen.findByTestId("paste-link-row"));
    await vi.waitFor(() => expect(push).toHaveBeenCalledWith("/share?url=https%3A%2F%2Fvt.tiktok.com%2FZSabc123%2F"));
  });

  it("iPhone: nothing useful copied says how to copy the link", async () => {
    setUA(IPHONE);
    Object.defineProperty(window.navigator, "clipboard", { value: { readText: () => Promise.resolve("hello") }, configurable: true });
    render(<PlaceSearch onPlaceSelect={() => {}} destination="Porto" />);
    fireEvent.focus(screen.getByPlaceholderText("Search places in Porto…"));
    fireEvent.click(await screen.findByTestId("paste-link-row"));
    expect(await screen.findByText(/tap Share, then Copy link/)).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });

  it("Android: no paste row (it has the share sheet), but pasting a link still goes to /share", () => {
    setUA(ANDROID);
    render(<PlaceSearch onPlaceSelect={() => {}} destination="Porto" />);
    const input = screen.getByPlaceholderText("Search places in Porto…");
    fireEvent.focus(input);
    expect(screen.queryByTestId("paste-link-row")).toBeNull();
    fireEvent.paste(input, { clipboardData: { getData: () => "https://www.instagram.com/reel/C9xYz_1/" } });
    expect(push).toHaveBeenCalledWith("/share?url=https%3A%2F%2Fwww.instagram.com%2Freel%2FC9xYz_1%2F");
  });
});

describe("map search: places already on your map (6 Oct 2026, taps audit)", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("a result already pinned says On your map with a filled pin; the others are unchanged", async () => {
    setUA(ANDROID);
    vi.stubGlobal("fetch", vi.fn(async () => ({ json: async () => ({ predictions: [
      { place_id: "gPiazza", description: "Piazza San Michele", structured_formatting: { main_text: "Piazza San Michele", secondary_text: "Lucca, Province of Lucca, Italy" } },
      { place_id: "gForo", description: "San Michele in Foro", structured_formatting: { main_text: "San Michele in Foro", secondary_text: "Piazza San Michele, Lucca, Italy" } },
    ] }) })));
    const onPlaceSelect = vi.fn();
    render(<PlaceSearch onPlaceSelect={onPlaceSelect} destination="Lucca" savedPlaceIds={new Set(["gPiazza"])} />);
    fireEvent.change(screen.getByPlaceholderText("Search places in Lucca…"), { target: { value: "piazza san mich" } });
    const saved = (await screen.findByText("Piazza San Michele")).closest("button")!;
    expect(saved.textContent).toContain("On your map");
    expect(saved.querySelector("[data-testid=on-map-pin]")).toBeTruthy();
    const other = screen.getByText("San Michele in Foro").closest("button")!;
    expect(other.textContent).not.toContain("On your map");
    fireEvent.click(saved);
    expect(onPlaceSelect).toHaveBeenCalledWith("gPiazza", expect.any(String));
  });
});
