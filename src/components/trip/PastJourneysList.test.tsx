// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, within } from "@testing-library/react";

/**
 * Past journeys on the phone read as memories, not clutter (7 Oct 2026,
 * delight audit). Each row: a 36px round cover, the title in ink, the month
 * and year, and no bin — delete lives in the journey's Settings.
 */

vi.mock("@/lib/tripArchive", () => ({ setTripArchived: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/deleteJourney", () => ({ deleteJourney: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("next/link", () => ({
  default: ({ children, href, className }: { children: React.ReactNode; href: string; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));

import PastJourneysList from "./PastJourneysList";
import type { Trip } from "@/types/database";

const past = {
  id: "cr", title: "Costa Rica", destination: "Costa Rica", start_date: "2026-03-04", end_date: "2026-04-02",
  cover_image_url: "https://example.com/cr.jpg", archived: false,
} as unknown as Trip;
const archived = {
  id: "mtl", title: "Montreal Winter Weekend", destination: "Montreal", start_date: "2025-12-27", end_date: "2025-12-30",
  cover_image_url: null, archived: true,
} as unknown as Trip;

function phone(container: HTMLElement) {
  return container.querySelector('[class~="md:hidden"]') as HTMLElement;
}

describe("Past journeys, phone rows", () => {
  it("shows the cover in a 36px circle, the title in ink and the start month + year", () => {
    const { container } = render(<PastJourneysList trips={[past]} hrefByTrip={{ cr: "/trips/cr/plan" }} />);
    const row = within(phone(container));
    const img = row.getByRole("img", { name: "Costa Rica" });
    expect(img.getAttribute("src")).toBe("https://example.com/cr.jpg");
    expect(img.className).toMatch(/w-9/);
    expect(img.className).toMatch(/h-9/);
    expect(img.className).toMatch(/rounded-full/);
    const title = row.getByText("Costa Rica", { selector: "p" });
    expect(title.style.color).toBe("rgb(26, 26, 46)");
    expect(row.getByText("MAR 2026")).toBeTruthy();
    // The whole row still opens the journey.
    expect(img.closest("a")?.getAttribute("href")).toBe("/trips/cr/plan");
  });

  it("has no bin on a past row", () => {
    const { container } = render(<PastJourneysList trips={[past]} hrefByTrip={{}} />);
    expect(within(phone(container)).queryByLabelText(/Delete/)).toBeNull();
  });

  it("an archived row keeps Restore, loses the bin, and falls back to a quiet circle", () => {
    const { container } = render(<PastJourneysList trips={[archived]} hrefByTrip={{}} />);
    const row = within(phone(container));
    expect(row.getByLabelText("Restore Montreal Winter Weekend")).toBeTruthy();
    expect(row.queryByLabelText(/Delete/)).toBeNull();
    expect(row.getByText("DEC 2025")).toBeTruthy();
    expect(phone(container).querySelector("[data-cover]")?.className).toMatch(/rounded-full/);
  });
});
