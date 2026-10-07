// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { renderToString } from "react-dom/server";

/**
 * The countdown on the journey card's caption (6 Oct 2026, Brennan). It is
 * decided in the browser after mount, so the server's HTML has none (a UTC
 * server would call it tomorrow from 8pm Eastern), and it is one whole piece
 * that wraps to the next line rather than breaking inside itself.
 */

vi.mock("@/lib/tripArchive", () => ({ setTripArchived: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({}) }));
vi.mock("@/lib/deleteJourney", () => ({ deleteJourney: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), back: vi.fn() }) }));
vi.mock("@/components/ui/Toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("next/link", () => ({ default: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));
vi.mock("./TripCover", () => ({ default: () => null }));

import TripCard from "./TripCard";
import type { Trip } from "@/types/database";

const trip = (start: string, end: string) =>
  ({ id: "t1", title: "Palm Springs", destination: "Palm Springs, CA", start_date: start, end_date: end, cover_image_url: null }) as unknown as Trip;

afterEach(() => { cleanup(); vi.useRealTimers(); });

function caption(container: HTMLElement): HTMLElement {
  return container.querySelector("p.uppercase") as HTMLElement;
}

describe("the journey card's countdown", () => {
  it("ends the caption with the countdown, as its own unbreakable piece", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 6, 21, 30)); // 6 Oct 2026, 9:30 pm local
    const { container } = render(<TripCard trip={trip("2027-03-14", "2027-03-17")} />);
    const p = caption(container);
    expect(p.textContent).toBe("MAR 14–17 · 3 NIGHTS · IN 5 MONTHS");
    const pieces = Array.from(p.querySelectorAll("span.whitespace-nowrap")).map((s) => s.textContent);
    expect(pieces).toEqual(["MAR 14–17 ·", "3 NIGHTS ·", "IN 5 MONTHS"]);
  });

  it("uses the reader's local date: tomorrow at 9:30 pm the night before", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2027, 2, 13, 21, 30));
    const { container } = render(<TripCard trip={trip("2027-03-14", "2027-03-17")} />);
    expect(caption(container).textContent).toBe("MAR 14–17 · 3 NIGHTS · TOMORROW");
  });

  it("long past: the caption alone", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 6, 12));
    const { container } = render(<TripCard trip={trip("2026-08-25", "2026-08-29")} />);
    expect(caption(container).textContent).toBe("AUG 25–29 · 4 NIGHTS");
  });

  it("the server's HTML carries no countdown", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 6, 12));
    const html = renderToString(<TripCard trip={trip("2027-03-14", "2027-03-17")} />);
    expect(html).toContain("3 NIGHTS");
    expect(html).not.toContain("MONTHS");
  });
});
