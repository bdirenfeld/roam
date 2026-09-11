// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { StayCandidate } from "@/types/database";

/**
 * The card, on its own.
 *
 * Brennan, 11 Sept 2026: "when you're in this mode, you should have a way
 * that's easy to go between the other options, without having to go back to
 * the menu." Comparing B against D meant leaving the card, finding the row,
 * opening it, and going back again. These pin the strip that replaced that.
 */

vi.mock("@/hooks/useEscapeKey", () => ({ useEscapeKey: () => {} }));

import StayCardSheet from "./StayCardSheet";

const CAND = {
  id: "c1", trip_id: "t", base: 0, letter: "B", name: "Hotel Noum Osaka",
  status: "candidate", site: "direct", url: "https://example.test",
  total: 1800, nightly_cad: 360, beds: null, baths: null, sleeps: null,
  score: 4.6, score_scale: 5, reviews: 412, review_notes: "quiet, clean",
  flags: [], feel: null, photos: ["https://img.test/1.jpg"], address: "Osaka, Japan",
  lat: 34.69, lng: 135.5, source: "google", drive: { hours: 0.2, line: "Centre 9 min", minutes: {} },
} as unknown as StayCandidate;

const DATES = { checkIn: "2027-04-10", checkOut: "2027-04-15", adults: 2, childrenAges: [10, 8, 5] };

function show(extra: Record<string, unknown> = {}) {
  return render(
    <StayCardSheet
      candidate={CAND}
      brief={null}
      startDate="2027-04-10"
      endDate="2027-04-15"
      nights={5}
      dates={DATES}
      busy={false}
      onChoose={vi.fn()}
      onSave={vi.fn()}
      onClose={vi.fn()}
      {...extra}
    />,
  );
}

describe("moving between the options from inside the card", () => {
  it("names the place with the letter on its pin, and offers both directions", async () => {
    show({ place: { letter: "B" }, onPrev: vi.fn(), onNext: vi.fn() });
    // The letter alone: it names the pin on the map and the row in the list.
    // "B of 5" read as a position and B is the second (Brennan, 11 Sept 2026).
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.queryByText(/of 5/)).toBeNull();
    expect(screen.getByRole("button", { name: "Previous place" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next place" })).toBeEnabled();
  });

  it("moves when either one is pressed", async () => {
    const onPrev = vi.fn(), onNext = vi.fn();
    show({ place: { letter: "B" }, onPrev, onNext });
    await userEvent.click(screen.getByRole("button", { name: "Next place" }));
    expect(onNext).toHaveBeenCalledOnce();
    await userEvent.click(screen.getByRole("button", { name: "Previous place" }));
    expect(onPrev).toHaveBeenCalledOnce();
  });

  it("greys out the direction that has nowhere to go", async () => {
    show({ place: { letter: "A" }, onNext: vi.fn() });
    expect(screen.getByRole("button", { name: "Previous place" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Next place" })).toBeEnabled();
  });

  it("leaves the strip off a list of one", async () => {
    show();
    expect(screen.queryByRole("button", { name: "Next place" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Previous place" })).toBeNull();
  });

  it("takes the arrow keys too, and does not fight the photo carousel", async () => {
    const onPrev = vi.fn(), onNext = vi.fn();
    show({ place: { letter: "B" }, onPrev, onNext });
    await userEvent.keyboard("{ArrowRight}");
    expect(onNext).toHaveBeenCalledOnce();
    await userEvent.keyboard("{ArrowLeft}");
    expect(onPrev).toHaveBeenCalledOnce();
    // One photo, so the carousel shows no arrows of its own to collide with.
    expect(screen.queryByRole("button", { name: "Next photo" })).toBeNull();
  });
});

describe("what the card still says while it does that", () => {
  it("keeps the price, the nights and the way out", async () => {
    show({ place: { letter: "B" }, onNext: vi.fn() });
    expect(screen.getByText("Hotel Noum Osaka")).toBeInTheDocument();
    expect(screen.getByText(/10–15 Apr · 5 nights/)).toBeInTheDocument();
    expect(screen.getByText(/\$1,800/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Choose" })).toBeInTheDocument();
  });
});
