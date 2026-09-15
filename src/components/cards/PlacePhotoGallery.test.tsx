// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

/**
 * The gallery, rendered. On 15 Sept 2026 a change meant to cap the DOTS at
 * five capped the PHOTOS at five too — the two lists were built the same
 * way — and every card with more than five photos opened onto a grey strip.
 * 451 tests were green. Nothing had ever rendered this component.
 */

let PHOTOS: unknown[] = [];
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () => Promise.resolve({ data: { photos: PHOTOS }, error: null }),
        }),
      }),
    }),
  }),
}));

import PlacePhotoGallery from "./PlacePhotoGallery";

function show(placeId: string, n: number) {
  PHOTOS = Array.from({ length: n }, (_, i) => ({ ref: `r${i}` }));
  return render(
    <PlacePhotoGallery placeId={placeId} hasGooglePhotos={true} fallbackLat={43.84} fallbackLng={10.5} title="Villa Bottino" height={220} />,
  );
}

describe("PlacePhotoGallery", () => {
  it("renders a slide for every photo — ten photos, ten slides", async () => {
    const { container } = show("place-ten", 10);
    await waitFor(() => expect(container.querySelectorAll(".snap-start").length).toBe(10));
    expect(screen.getByText("1/10")).toBeInTheDocument();
  });

  it("shows dots for a handful and only the counter past five", async () => {
    const three = show("place-three", 3);
    await waitFor(() => expect(three.container.querySelectorAll(".snap-start").length).toBe(3));
    expect(three.container.querySelectorAll('[aria-label^="Photo "]').length).toBe(3);
    three.unmount();

    const ten = show("place-ten-b", 10);
    await waitFor(() => expect(ten.container.querySelectorAll(".snap-start").length).toBe(10));
    expect(ten.container.querySelectorAll('[aria-label^="Photo "]').length).toBe(0);
  });
});
